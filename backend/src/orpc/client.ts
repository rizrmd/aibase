import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { AppRouter } from './router';

/**
 * Create oRPC client for HTTP requests
 */
export function createClient(baseUrl = 'http://localhost:3000') {
  const link = new RPCLink({
    url: `${baseUrl}/orpc`,
  });

  return createORPCClient<AppRouter>(link);
}

/**
 * WebSocket client - mirrors Conversation class API
 */
export class WSClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(
    private conversationId: string,
    private wsUrl = 'ws://localhost:3000/ws'
  ) {}

  /**
   * Get the conversation ID
   */
  get id(): string {
    return this.conversationId;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[WS Client] Connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Call registered handlers
            this.messageHandlers.forEach((handler) => handler(data));
          } catch (error) {
            console.error('[WS Client] Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WS Client] Error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[WS Client] Disconnected');
          this.handleReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;

      console.log(`[WS Client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('[WS Client] Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('[WS Client] Max reconnection attempts reached');
    }
  }

  /**
   * Send a message to the WebSocket
   */
  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      throw new Error('WebSocket is not connected');
    }
  }

  /**
   * Send a message - mirrors Conversation.sendMessage()
   * Returns an async generator that can be awaited or iterated
   */
  async *sendMessage(message: string): AsyncGenerator<string, void, unknown> {
    const chunkQueue: string[] = [];
    let isComplete = false;
    let error: Error | null = null;
    let resolveWaiting: (() => void) | null = null;

    const handler = (data: any) => {
      if (data.method === 'sendMessage' && data.conversationId === this.conversationId) {
        if (data.streaming && data.chunk) {
          chunkQueue.push(data.chunk);
          if (resolveWaiting) {
            resolveWaiting();
            resolveWaiting = null;
          }
        }

        if (data.streaming && data.done) {
          isComplete = true;
          this.off(handler);
          if (resolveWaiting) {
            resolveWaiting();
            resolveWaiting = null;
          }
        }

        if (data.error) {
          error = new Error(data.error);
          this.off(handler);
          if (resolveWaiting) {
            resolveWaiting();
            resolveWaiting = null;
          }
        }
      }
    };

    this.on(handler);

    try {
      this.send({
        method: 'sendMessage',
        conversationId: this.conversationId,
        params: { message },
      });
    } catch (err) {
      this.off(handler);
      throw err;
    }

    try {
      while (!isComplete && !error) {
        while (chunkQueue.length > 0) {
          yield chunkQueue.shift()!;
        }

        if (!isComplete && !error) {
          await new Promise<void>((resolve) => {
            resolveWaiting = resolve;
            setTimeout(resolve, 100);
          });
        }
      }

      while (chunkQueue.length > 0) {
        yield chunkQueue.shift()!;
      }

      if (error) {
        throw error;
      }
    } finally {
      this.off(handler);
    }
  }

  /**
   * Register a message handler
   */
  on(handler: (data: any) => void): string {
    const id = Math.random().toString(36).substring(7);
    this.messageHandlers.set(id, handler);
    return id;
  }

  /**
   * Unregister a message handler
   */
  off(handlerOrId: ((data: any) => void) | string): boolean {
    if (typeof handlerOrId === 'string') {
      return this.messageHandlers.delete(handlerOrId);
    }

    // Find and remove handler by reference
    for (const [id, handler] of this.messageHandlers.entries()) {
      if (handler === handlerOrId) {
        return this.messageHandlers.delete(id);
      }
    }

    return false;
  }

  /**
   * Abort the current message - mirrors Conversation.abort()
   */
  async abort(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (data: any) => {
        if (data.method === 'abort' && data.conversationId === this.conversationId) {
          this.off(handler);
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve();
          }
        }
      };

      this.on(handler);

      try {
        this.send({
          method: 'abort',
          conversationId: this.conversationId,
        });
      } catch (error) {
        this.off(handler);
        reject(error);
      }
    });
  }

  /**
   * Clear history - mirrors Conversation.clearHistory()
   */
  async clearHistory(keepSystemPrompt: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (data: any) => {
        if (data.method === 'clearHistory' && data.conversationId === this.conversationId) {
          this.off(handler);
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve();
          }
        }
      };

      this.on(handler);

      try {
        this.send({
          method: 'clearHistory',
          conversationId: this.conversationId,
          params: { keepSystemPrompt },
        });
      } catch (error) {
        this.off(handler);
        reject(error);
      }
    });
  }

  /**
   * Get history - mirrors Conversation.history getter
   */
  async getHistory(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const handler = (data: any) => {
        if (data.method === 'getHistory' && data.conversationId === this.conversationId) {
          this.off(handler);
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve(data.result?.history || []);
          }
        }
      };

      this.on(handler);

      try {
        this.send({
          method: 'getHistory',
          conversationId: this.conversationId,
        });
      } catch (error) {
        this.off(handler);
        reject(error);
      }
    });
  }

  /**
   * Check if processing - mirrors Conversation.isProcessing()
   */
  async isProcessing(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const handler = (data: any) => {
        if (data.method === 'isProcessing' && data.conversationId === this.conversationId) {
          this.off(handler);
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve(data.result?.isProcessing || false);
          }
        }
      };

      this.on(handler);

      try {
        this.send({
          method: 'isProcessing',
          conversationId: this.conversationId,
        });
      } catch (error) {
        this.off(handler);
        reject(error);
      }
    });
  }

  /**
   * Ping the server
   */
  ping(): void {
    this.send({
      method: 'ping',
      conversationId: this.conversationId,
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Example usage
 */
export async function exampleUsage() {
  // HTTP client for non-streaming operations
  const client = createClient('http://localhost:3000');

  // Create a conversation
  const createResult = await client.conversation.create({
    conversationId: 'my-conversation-1',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
  });
  console.log('Created conversation:', createResult);

  // Send a message (non-streaming via HTTP)
  const messageResult = await client.conversation.sendMessage({
    conversationId: 'my-conversation-1',
    message: 'Hello, how are you?',
  });
  console.log('Response:', messageResult);

  // Get conversation history
  const httpHistory = await client.conversation.getHistory({
    conversationId: 'my-conversation-1',
  });
  console.log('History:', httpHistory);

  // WebSocket client for streaming - mirrors Conversation class
  const conversationId = crypto.randomUUID();
  const wsClient = new WSClient(conversationId, 'ws://localhost:3000/ws');

  // Connect
  await wsClient.connect();

  // Send message with streaming (iterating over chunks)
  console.log('\nStreaming response:');
  for await (const chunk of wsClient.sendMessage('Tell me a short story')) {
    process.stdout.write(chunk);
  }

  // Or await for full response (same method!)
  console.log('\n\nNon-streaming response:');
  const fullResponse = await (async () => {
    let text = '';
    for await (const chunk of wsClient.sendMessage('What is 2+2?')) {
      text += chunk;
    }
    return text;
  })();
  console.log(fullResponse);

  // Check if processing
  const processing = await wsClient.isProcessing();
  console.log('Is processing:', processing);

  // Get history
  const wsHistory = await wsClient.getHistory();
  console.log('History length:', wsHistory.length);

  // Clear history
  await wsClient.clearHistory();

  // Clean up
  wsClient.disconnect();
}
