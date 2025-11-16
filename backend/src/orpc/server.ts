import { RPCHandler } from '@orpc/server/fetch';
import { router } from './router';
import { conversations } from './procedures/conversation';
import { Conversation } from '../llm/conversation';
import { conversationService } from '../db/conversation-service';
import type { ServerWebSocket } from 'bun';

/**
 * Create oRPC RPC handler
 */
const orpcHandler = new RPCHandler(router);

/**
 * WebSocket connection data
 */
interface WebSocketData {
  conversationId?: string;
  authenticated?: boolean;
}

/**
 * WebSocket message types - mirrors Conversation class methods
 */
interface WSMessage {
  method: 'sendMessage' | 'abort' | 'clearHistory' | 'getHistory' | 'isProcessing' | 'ping';
  conversationId: string;
  params?: {
    message?: string;
    keepSystemPrompt?: boolean;
  };
}

interface WSResponse {
  method: string;
  conversationId: string;
  result?: any;
  error?: string;
  // Streaming-specific fields
  streaming?: boolean;
  chunk?: string;
  done?: boolean;
}

/**
 * Start the Bun server with oRPC and WebSocket support
 */
export function startServer(port = 3000) {
  const server = Bun.serve<WebSocketData>({
    port,

    async fetch(req, server) {
      const url = new URL(req.url);

      // Handle WebSocket upgrade
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: {
            authenticated: false,
          },
        });

        if (upgraded) {
          return undefined; // Successfully upgraded to WebSocket
        }

        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // Handle oRPC requests
      if (url.pathname.startsWith('/orpc')) {
        // Create a new request with the path adjusted for oRPC
        const orpcPath = url.pathname.replace('/orpc', '');
        const orpcUrl = new URL(orpcPath || '/', url.origin);
        orpcUrl.search = url.search;

        const orpcRequest = new Request(orpcUrl, {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });

        const result = await orpcHandler.handle(orpcRequest);
        return result.response || new Response('Not found', { status: 404 });
      }

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Serve static files from frontend/build
      const frontendPath = new URL('../../../frontend/build', import.meta.url).pathname;
      let filePath = frontendPath + url.pathname;

      // Try to serve the requested file
      let file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file);
      }

      // If file doesn't exist and it's not an API route, serve index.html for SPA routing
      if (!url.pathname.startsWith('/orpc') && !url.pathname.startsWith('/ws') && !url.pathname.startsWith('/health')) {
        file = Bun.file(frontendPath + '/index.html');
        if (await file.exists()) {
          return new Response(file);
        }
      }

      // Default response if frontend not found
      return new Response(JSON.stringify({
        message: 'oRPC + WebSocket Server',
        endpoints: {
          orpc: '/orpc/*',
          websocket: '/ws',
          health: '/health',
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },

    websocket: {
      /**
       * Called when a WebSocket connection is opened
       */
      open(ws: ServerWebSocket<WebSocketData>) {
        console.log('[WebSocket] Client connected');
      },

      /**
       * Called when a message is received
       */
      async message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        /**
         * Helper to get or create a conversation
         */
        async function getOrCreateConversation(conversationId: string): Promise<Conversation> {
        let conversation = conversations.get(conversationId);

        if (!conversation) {
          // Try to load from database
          const { conversation: dbConversation, messages: dbMessages } =
            await conversationService.loadFullConversation(conversationId);

          if (dbConversation) {
            // Restore from database
            conversation = new Conversation({
              systemPrompt: dbConversation.systemPrompt,
              temperature: dbConversation.modelParams?.temperature,
              maxTokens: dbConversation.modelParams?.maxTokens,
              configName: dbConversation.configName,
              initialHistory: dbMessages,
              hooks: {
                history: async (history) => {
                  const currentCount = await conversationService.getMessageCount(conversationId);
                  const newMessages = history.slice(currentCount);
                  if (newMessages.length > 0) {
                    await conversationService.addMessages(conversationId, newMessages);
                  }
                },
              },
            });
          } else {
            // Create new conversation
            conversation = new Conversation({
              hooks: {
                history: async (history) => {
                  const currentCount = await conversationService.getMessageCount(conversationId);
                  const newMessages = history.slice(currentCount);
                  if (newMessages.length > 0) {
                    await conversationService.addMessages(conversationId, newMessages);
                  }
                },
              },
            });

            // Save to database
            await conversationService.createConversation({
              id: conversationId,
            });
          }

          conversations.set(conversationId, conversation);
        }

          return conversation;
        }

        try {
          const data = JSON.parse(message.toString()) as WSMessage;
          const { method, conversationId, params } = data;

          // Get or create conversation on-demand
          const conv = await getOrCreateConversation(conversationId);

          switch (method) {
            case 'ping':
              ws.send(JSON.stringify({
                method: 'ping',
                conversationId,
                result: 'pong',
              } as WSResponse));
              break;

            case 'sendMessage':
              if (!params?.message) {
                ws.send(JSON.stringify({
                  method,
                  conversationId,
                  error: 'message is required',
                } as WSResponse));
                return;
              }

              // Stream the response
              try {
                for await (const chunk of conv.sendMessage(params.message)) {
                  ws.send(JSON.stringify({
                    method,
                    conversationId,
                    streaming: true,
                    chunk,
                    done: false,
                  } as WSResponse));
                }

                ws.send(JSON.stringify({
                  method,
                  conversationId,
                  streaming: true,
                  done: true,
                  result: { historyLength: conv.history.length },
                } as WSResponse));
              } catch (error) {
                ws.send(JSON.stringify({
                  method,
                  conversationId,
                  error: error instanceof Error ? error.message : 'Unknown error',
                } as WSResponse));
              }
              break;

            case 'abort':
              conv.abort();
              ws.send(JSON.stringify({
                method,
                conversationId,
                result: { aborted: true },
              } as WSResponse));
              break;

            case 'clearHistory':
              conv.clearHistory(params?.keepSystemPrompt ?? true);
              ws.send(JSON.stringify({
                method,
                conversationId,
                result: { historyLength: conv.history.length },
              } as WSResponse));
              break;

            case 'getHistory':
              ws.send(JSON.stringify({
                method,
                conversationId,
                result: { history: conv.history },
              } as WSResponse));
              break;

            case 'isProcessing':
              ws.send(JSON.stringify({
                method,
                conversationId,
                result: { isProcessing: conv.isProcessing() },
              } as WSResponse));
              break;

            default:
              ws.send(JSON.stringify({
                method,
                conversationId,
                error: `Unknown method: ${method}`,
              } as WSResponse));
          }
        } catch (error) {
          console.error('[WebSocket] Error processing message:', error);
          ws.send(JSON.stringify({
            method: 'error',
            conversationId: '',
            error: error instanceof Error ? error.message : 'Failed to process message',
          } as WSResponse));
        }
      },

      /**
       * Called when a WebSocket connection is closed
       */
      close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
        console.log('[WebSocket] Client disconnected:', { code, reason, conversationId: ws.data.conversationId });
      },

      /**
       * Called when an error occurs
       */
      error(ws: ServerWebSocket<WebSocketData>, error: Error) {
        console.error('[WebSocket] Error:', error);
      },
    },
  });

  console.log(`Server running on http://localhost:${port}`);
  console.log(`WebSocket available at ws://localhost:${port}/ws`);
  console.log(`oRPC endpoints at http://localhost:${port}/orpc/*`);

  return server;
}

// Start server if this file is run directly
if (import.meta.main) {
  const port = parseInt(process.env.PORT || '5040', 10);
  startServer(port);
}
