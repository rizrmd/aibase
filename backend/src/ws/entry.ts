/**
 * WebSocket server for bidirectional LLM communication
 */

import type {
  WSServerOptions,
  WSMessage,
  SessionInfo,
  ControlMessage,
  UserMessageData,
} from "./types";
import { Conversation, Tool } from "../llm/conversation";
import { getBuiltinTools } from "../tools";
import { WSEventEmitter } from "./events";
import { MessagePersistence } from "./msg-persistance";

// Use Bun's built-in WebSocket type for compatibility
// This matches Bun's ServerWebSocket interface
type ServerWebSocket = any; // Bun's ServerWebSocket type

// WebSocket ready states
const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

// Streaming chunk accumulator for broadcasting to new connections
interface StreamingState {
  convId: string;
  messageId: string;
  chunks: string[];
  fullResponse: string;
  startTime: number;
  lastChunkTime: number;
}

class StreamingManager {
  private activeStreams = new Map<string, StreamingState>(); // key: convId_messageId

  startStream(convId: string, messageId: string): void {
    const key = `${convId}_${messageId}`;
    console.log(`[StreamingManager] Starting stream: ${key}`);
    this.activeStreams.set(key, {
      convId,
      messageId,
      chunks: [],
      fullResponse: "",
      startTime: Date.now(),
      lastChunkTime: Date.now(),
    });
    console.log(
      `[StreamingManager] Total active streams: ${this.activeStreams.size}`
    );
  }

  addChunk(convId: string, messageId: string, chunk: string): void {
    const key = `${convId}_${messageId}`;
    const stream = this.activeStreams.get(key);
    if (!stream) return;

    stream.chunks.push(chunk);
    stream.fullResponse += chunk;
    stream.lastChunkTime = Date.now();
  }

  completeStream(convId: string, messageId: string): void {
    const key = `${convId}_${messageId}`;
    const stream = this.activeStreams.get(key);
    if (stream) {
      console.log(
        `[StreamingManager] Completing stream: ${key} (had ${stream.fullResponse.length} chars)`
      );
    }
    // Remove the stream immediately after completion
    this.activeStreams.delete(key);
    console.log(
      `[StreamingManager] Total active streams: ${this.activeStreams.size}`
    );
  }

  getStream(convId: string, messageId: string): StreamingState | undefined {
    const key = `${convId}_${messageId}`;
    return this.activeStreams.get(key);
  }

  getActiveStreamsForConv(convId: string): StreamingState[] {
    return Array.from(this.activeStreams.values()).filter(
      (stream) => stream.convId === convId
    );
  }

  getAllStreamsForConv(convId: string): StreamingState[] {
    return Array.from(this.activeStreams.values()).filter(
      (stream) => stream.convId === convId
    );
  }
}

export class WSServer extends WSEventEmitter {
  private options: WSServerOptions;
  private connections = new Map<ServerWebSocket, ConnectionInfo>();
  private sessions = new Map<string, SessionInfo>();
  private heartbeats = new Map<ServerWebSocket, NodeJS.Timeout>();
  private messagePersistence: MessagePersistence;
  private streamingManager: StreamingManager;

  constructor(options: WSServerOptions = {}) {
    super();
    this.options = {
      maxConnections: 100,
      heartbeatInterval: 30000,
      enableCompression: true,
      conversationOptions: {},
      ...options,
    };
    this.messagePersistence = MessagePersistence.getInstance();
    this.streamingManager = new StreamingManager();
  }

  /**
   * Initialize the WebSocket server handlers
   */
  getWebSocketHandlers() {
    return {
      open: this.handleConnectionOpen.bind(this),
      message: this.handleMessage.bind(this),
      close: this.handleConnectionClose.bind(this),
    };
  }

  /**
   * Handle HTTP upgrade requests for WebSocket
   * Note: This method is kept for compatibility but the actual upgrade logic
   * should be handled in the main server where URL parameters are extracted
   */
  handleHttpUpgrade(req: Request, server: any): Response | undefined {
    const url = new URL(req.url);

    // Check if this is a WebSocket upgrade request
    if (url.pathname.startsWith("/api/ws")) {
      // Check connection limit
      if (
        this.options.maxConnections &&
        this.connections.size >= this.options.maxConnections
      ) {
        return new Response("Server at capacity", { status: 503 });
      }

      // For direct usage without the main server, extract convId here
      const convId = url.searchParams.get("convId");
      const upgraded = server.upgrade(req, { data: { convId } });
      if (upgraded) {
        return undefined; // WebSocket connection established
      }
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    // Clear all heartbeats
    for (const timer of this.heartbeats.values()) {
      clearInterval(timer);
    }
    this.heartbeats.clear();

    // Clear all connections
    this.connections.clear();
    this.sessions.clear();

    this.emit("stopped");
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection count for a specific conversation
   */
  getConnectionCountForConv(convId: string): number {
    return this.getConnectionsForConv(convId).length;
  }

  /**
   * Get all conversation IDs with active connections
   */
  getActiveConvIds(): string[] {
    const convIds = new Set<string>();
    for (const connInfo of this.connections.values()) {
      convIds.add(connInfo.convId);
    }
    return Array.from(convIds);
  }

  /**
   * Get connection information for debugging
   */
  getConnectionInfo(): {
    [convId: string]: { connectionCount: number; sessionIds: string[] };
  } {
    const info: {
      [convId: string]: { connectionCount: number; sessionIds: string[] };
    } = {};

    for (const connInfo of this.connections.values()) {
      if (!info[connInfo.convId]) {
        info[connInfo.convId] = {
          connectionCount: 0,
          sessionIds: [],
        };
      }
      if (connInfo.convId && info[connInfo.convId]!) {
        info[connInfo.convId]!.connectionCount++;
        info[connInfo.convId]!.sessionIds.push(connInfo.sessionId);
      }
    }

    return info;
  }

  /**
   * Send message to specific client
   */
  sendToClient(convId: string, message: WSMessage): boolean {
    for (const [ws, connInfo] of this.connections) {
      if (connInfo.convId === convId) {
        return this.sendToWebSocket(ws, message);
      }
    }
    return false;
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: WSMessage, excludeClientId?: string): number {
    let sent = 0;
    for (const [ws, connInfo] of this.connections) {
      if (connInfo.convId !== excludeClientId) {
        if (this.sendToWebSocket(ws, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  /**
   * Get all WebSocket connections for a specific conversation ID
   */
  getConnectionsForConv(convId: string): ServerWebSocket[] {
    const connections: ServerWebSocket[] = [];
    for (const [ws, connInfo] of this.connections) {
      if (connInfo.convId === convId) {
        connections.push(ws);
      }
    }
    return connections;
  }

  /**
   * Send accumulated chunks to a newly connected WebSocket
   * Only sends currently active (incomplete) streams
   * Note: Completed message history is sent via get_history control message
   */
  private sendAccumulatedChunks(ws: ServerWebSocket, convId: string): void {
    const activeStreams = this.streamingManager.getActiveStreamsForConv(convId);

    console.log(
      `sendAccumulatedChunks: Found ${activeStreams.length} active streams for convId: ${convId}`
    );

    for (const stream of activeStreams) {
      if (stream.fullResponse.length > 0) {
        // Send the current accumulated response as a single chunk
        console.log(
          `Sending accumulated active stream: ${stream.messageId}, accumulated length: ${stream.fullResponse.length}`
        );
        this.sendToWebSocket(ws, {
          type: "llm_chunk",
          id: stream.messageId,
          data: {
            chunk: stream.fullResponse,
            isComplete: false,
            isAccumulated: true,
          },
          metadata: {
            timestamp: stream.lastChunkTime,
            convId: stream.convId,
            isAccumulated: true,
          },
        });
      }
    }
  }

  private async handleConnectionOpen(ws: ServerWebSocket): Promise<void> {
    // Extract client ID from URL parameters if provided
    let urlClientId: string | null = null;

    try {
      // Extract client ID from the data passed during upgrade
      urlClientId = ws.data?.convId || null;
    } catch (error) {
      console.warn("Failed to extract client ID from WebSocket data:", error);
    }

    // Use provided client ID or generate a new one
    const convId = urlClientId || this.generateClientId();
    const sessionId = this.generateSessionId();

    console.log(`=== New Connection ===`);
    console.log(`convId: ${convId} (from URL: ${!!urlClientId})`);
    console.log(
      `Total active streams in manager: ${
        Array.from(this.streamingManager["activeStreams"].keys()).length
      }`
    );
    console.log(
      `Active stream keys:`,
      Array.from(this.streamingManager["activeStreams"].keys())
    );

    const connectionInfo: ConnectionInfo = {
      convId,
      sessionId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      isAlive: true,
    };

    this.connections.set(ws, connectionInfo);

    // Create session
    const sessionInfo: SessionInfo = {
      id: sessionId,
      convId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
    };
    this.sessions.set(sessionId, sessionInfo);

    // Create conversation for this session with existing history
    const existingHistory = this.messagePersistence.getClientHistory(convId);
    const conversation = await this.createConversation(existingHistory, convId);
    connectionInfo.conversation = conversation;

    // Hook into conversation to persist changes to MessagePersistence
    const originalAddMessage = conversation.addMessage.bind(conversation);
    conversation.addMessage = (message: any) => {
      originalAddMessage(message);
      // Immediately persist the updated conversation history
      const history = (conversation as any)._history || [];
      this.messagePersistence.setClientHistory(convId, history);
    };

    // Start heartbeat for this connection
    this.startHeartbeat(ws);

    // Send accumulated chunks from active streams for this conversation
    this.sendAccumulatedChunks(ws, convId);

    // Send welcome message
    this.sendToWebSocket(ws, {
      type: "status",
      id: this.generateMessageId(),
      data: {
        status: "connected",
        message: "Connected to chat server",
        convId,
        sessionId,
      },
      metadata: {
        timestamp: Date.now(),
        convId,
        sessionId,
      },
    });

    this.emit("client_connected", { convId, sessionId, ws });
  }

  private async handleMessage(
    ws: ServerWebSocket,
    message: string | Buffer
  ): Promise<void> {
    const connectionInfo = this.connections.get(ws);
    if (!connectionInfo) return;

    try {
      const wsMessage: WSMessage = JSON.parse(message.toString());
      connectionInfo.lastActivity = Date.now();
      connectionInfo.messageCount++;

      // Update session
      const session = this.sessions.get(connectionInfo.sessionId);
      if (session) {
        session.lastActivity = Date.now();
        session.messageCount++;
      }

      await this.processMessage(ws, connectionInfo, wsMessage);
    } catch (error) {
      console.error("Failed to process message:", error);
      this.sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
    }
  }

  private async processMessage(
    ws: ServerWebSocket,
    connectionInfo: ConnectionInfo,
    message: WSMessage
  ): Promise<void> {
    switch (message.type) {
      case "user_message":
        await this.handleUserMessage(ws, connectionInfo, message);
        break;

      case "control":
        await this.handleControlMessage(ws, connectionInfo, message);
        break;

      case "ping":
        this.sendToWebSocket(ws, {
          type: "pong",
          id: message.id,
          metadata: { timestamp: Date.now() },
        });
        break;

      default:
        this.sendError(
          ws,
          "UNKNOWN_MESSAGE_TYPE",
          `Unknown message type: ${message.type}`
        );
    }
  }

  private async handleUserMessage(
    ws: ServerWebSocket,
    connectionInfo: ConnectionInfo,
    message: WSMessage
  ): Promise<void> {
    const conversation = connectionInfo.conversation;
    if (!conversation) {
      this.sendError(ws, "NO_CONVERSATION", "No active conversation");
      return;
    }

    // Check if already processing a message for this connection
    if (connectionInfo.isProcessing) {
      console.log(`[UserMessage] Already processing a message for convId: ${connectionInfo.convId}, ignoring duplicate`);
      return;
    }

    const userData = message.data as UserMessageData;

    // Mark as processing
    connectionInfo.isProcessing = true;

    // Process message asynchronously without blocking
    this.processUserMessageAsync(ws, connectionInfo, message, userData)
      .catch((error) => {
        console.error("Error processing user message:", error);
        this.sendError(ws, "PROCESSING_ERROR", error.message);
      })
      .finally(() => {
        // Clear processing flag when done
        connectionInfo.isProcessing = false;
      });
  }

  private async processUserMessageAsync(
    ws: ServerWebSocket,
    connectionInfo: ConnectionInfo,
    originalMessage: WSMessage,
    userData: UserMessageData
  ): Promise<void> {
    const conversation = connectionInfo.conversation;
    if (!conversation) return;

    // Generate IDs for user and assistant messages
    const userMsgId = `user_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 11)}`;
    const assistantMsgId = `assistant_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 11)}`; // Generate unique ID for assistant
    const startTime = Date.now(); // Track start time for completion time calculation

    try {
      // Store assistant message ID in connection info for tool hooks to access
      (connectionInfo as any).assistantMsgId = assistantMsgId;

      // Start tracking this stream in the streaming manager
      this.streamingManager.startStream(connectionInfo.convId, assistantMsgId);

      // Send processing status to all connections for this conversation
      const statusMessage = {
        type: "status" as const,
        id: this.generateMessageId(),
        data: { status: "processing", message: "Processing your message..." },
        metadata: { timestamp: Date.now() },
      };
      this.broadcastToConv(connectionInfo.convId, statusMessage);

      let fullResponse = "";
      let chunkCount = 0;

      // Process message with streaming - no timeouts
      for await (const chunk of conversation.sendMessage(userData.text)) {
        fullResponse += chunk;
        chunkCount++;

        // Calculate elapsed time for this chunk
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

        console.log(
          `[Backend Chunk ${chunkCount}] Received ${chunk.length} chars, total now: ${fullResponse.length}, elapsed: ${elapsedSeconds}s`
        );

        // Add chunk to streaming manager
        this.streamingManager.addChunk(
          connectionInfo.convId,
          assistantMsgId,
          chunk
        );

        // Create chunk message with elapsed time
        const chunkMessage = {
          type: "llm_chunk" as const,
          id: assistantMsgId,
          data: {
            chunk,
            isComplete: false,
            elapsedTime: elapsedSeconds,
          },
          metadata: {
            timestamp: Date.now(),
            convId: connectionInfo.convId,
          },
        };

        // Broadcast chunk to ALL connections for this conversation
        this.broadcastToConv(connectionInfo.convId, chunkMessage);
      }

      console.log(
        `[Backend Complete] Streaming finished. Total chunks: ${chunkCount}, Final fullResponse length: ${fullResponse.length}`
      );
      console.log(
        `[Backend Complete] First 100 chars: "${fullResponse.substring(
          0,
          100
        )}..."`
      );
      console.log(
        `[Backend Complete] Last 100 chars: "...${fullResponse.substring(
          fullResponse.length - 100
        )}"`
      );

      // Calculate completion time in seconds
      const completionTimeMs = Date.now() - startTime;
      const completionTimeSeconds = Math.floor(completionTimeMs / 1000);
      console.log(
        `[Backend Complete] Completion time: ${completionTimeSeconds}s (${completionTimeMs}ms)`
      );

      // Mark stream as complete in streaming manager
      this.streamingManager.completeStream(
        connectionInfo.convId,
        assistantMsgId
      );

      // Send completion message to all connections for this conversation
      const completionMessage = {
        type: "llm_complete" as const,
        id: assistantMsgId,
        data: {
          fullText: fullResponse,
          completionTime: completionTimeSeconds,
        },
        metadata: {
          timestamp: Date.now(),
          convId: connectionInfo.convId,
        },
      };
      console.log(
        `[Backend Complete] Broadcasting completion message with ${fullResponse.length} chars, completionTime: ${completionTimeSeconds}s`
      );
      this.broadcastToConv(connectionInfo.convId, completionMessage);

      // Save updated conversation history to persistent storage with message IDs
      const currentHistory = conversation.history;

      // Add message IDs and completionTime to the last user and assistant messages
      const historyWithIds = currentHistory.map((msg: any, index: number) => {
        // Check if this is the latest user message (second-to-last) or assistant message (last)
        if (index === currentHistory.length - 2 && msg.role === "user") {
          return { ...msg, id: userMsgId };
        } else if (
          index === currentHistory.length - 1 &&
          msg.role === "assistant"
        ) {
          return {
            ...msg,
            id: assistantMsgId,
            completionTime: completionTimeSeconds,
          };
        }
        // Keep existing ID or don't add one for system/older messages
        return msg;
      });

      console.log(
        `[Backend Complete] Saving conversation history for ${connectionInfo.convId}`
      );
      console.log(
        `[Backend Complete] History has ${historyWithIds.length} messages`
      );
      console.log(
        `[Backend Complete] History messages:`,
        historyWithIds.map((m: any) => ({
          role: m.role,
          id: m.id,
          contentLength:
            typeof m.content === "string" ? m.content.length : "N/A",
        }))
      );
      this.messagePersistence.setClientHistory(
        connectionInfo.convId,
        historyWithIds
      );

      // Verify it was saved
      const savedHistory = this.messagePersistence.getClientHistory(
        connectionInfo.convId
      );
      console.log(
        `[Backend Complete] Verification: Saved history has ${savedHistory.length} messages`
      );

      // Clean up assistant message ID from connection info
      delete (connectionInfo as any).assistantMsgId;
    } catch (error: any) {
      console.error("LLM Processing Error:", error);

      // Clean up assistant message ID from connection info even on error
      delete (connectionInfo as any).assistantMsgId;

      // Mark stream as complete even on error
      this.streamingManager.completeStream(
        connectionInfo.convId,
        assistantMsgId
      );

      // Check if this was an abort (user-initiated cancellation)
      const isAbort = error?.name === "AbortError" || error?.message?.includes("abort");

      if (isAbort) {
        console.log(`[Abort] Stream aborted for message ${assistantMsgId}`);

        // Get the partial response from streaming manager
        const stream = this.streamingManager.getStream(connectionInfo.convId, assistantMsgId);
        const partialResponse = stream?.fullResponse || "";

        if (partialResponse.length > 0 && conversation) {
          console.log(`[Abort] Saving partial response to history (${partialResponse.length} chars)`);

          // Get current history and add the partial response
          const currentHistory = conversation.history;

          // Add message IDs to the last user and assistant messages
          const historyWithIds = currentHistory.map((msg: any, index: number) => {
            if (index === currentHistory.length - 2 && msg.role === "user") {
              return { ...msg, id: userMsgId };
            } else if (index === currentHistory.length - 1 && msg.role === "assistant") {
              // Mark as incomplete/aborted
              return {
                ...msg,
                id: assistantMsgId,
                content: partialResponse,
                aborted: true
              };
            }
            return msg;
          });

          // Save to persistent storage
          this.messagePersistence.setClientHistory(connectionInfo.convId, historyWithIds);
          console.log(`[Abort] Saved aborted message to history`);
        }

        // Don't send error messages for user-initiated aborts
        return;
      }

      const errorMessage =
        "I apologize, but I encountered an error processing your request. Please try again.";

      // Send error response to all connections
      const errorChunkMessage = {
        type: "llm_chunk" as const,
        id: assistantMsgId,
        data: { chunk: errorMessage, isComplete: false },
        metadata: { timestamp: Date.now() },
      };
      this.broadcastToConv(connectionInfo.convId, errorChunkMessage);

      const errorCompletionMessage = {
        type: "llm_complete" as const,
        id: assistantMsgId,
        data: { fullText: errorMessage },
        metadata: { timestamp: Date.now() },
      };
      this.broadcastToConv(connectionInfo.convId, errorCompletionMessage);
    }
  }

  /**
   * Broadcast message to all connections for a specific conversation
   */
  private broadcastToConv(convId: string, message: WSMessage): number {
    let sent = 0;
    for (const [ws, connInfo] of this.connections) {
      if (connInfo.convId === convId) {
        if (this.sendToWebSocket(ws, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  private async handleControlMessage(
    ws: ServerWebSocket,
    connectionInfo: ConnectionInfo,
    message: WSMessage
  ): Promise<void> {
    const conversation = connectionInfo.conversation;
    const control = message.data as ControlMessage;

    try {
      switch (control.type) {
        case "abort":
          if (conversation) {
            console.log(`[Abort] Aborting conversation for convId: ${connectionInfo.convId}`);
            conversation.abort();

            // Clean up any active streams for this conversation
            const activeStreams = this.streamingManager.getActiveStreamsForConv(connectionInfo.convId);
            console.log(`[Abort] Cleaning up ${activeStreams.length} active streams`);
            for (const stream of activeStreams) {
              this.streamingManager.completeStream(connectionInfo.convId, stream.messageId);
            }

            // Clear assistant message ID from connection info
            delete (connectionInfo as any).assistantMsgId;

            // Clear processing flag to allow new messages
            connectionInfo.isProcessing = false;

            this.sendToWebSocket(ws, {
              type: "control_response",
              id: message.id,
              data: { status: "aborted", type: control.type },
              metadata: { timestamp: Date.now() },
            });
          }
          break;

        case "clear_history":
          if (conversation) {
            conversation.clearHistory();
            // Also clear from persistent storage
            this.messagePersistence.clearClientHistory(connectionInfo.convId);
            this.sendToWebSocket(ws, {
              type: "control_response",
              id: message.id,
              data: { status: "cleared", type: control.type },
              metadata: { timestamp: Date.now() },
            });
          }
          break;

        case "get_history":
          // Get history from persistent storage (which should match conversation history)
          console.log(
            `Backend: Getting history for convId: ${connectionInfo.convId}`
          );
          const history = this.messagePersistence.getClientHistory(
            connectionInfo.convId
          );

          // Filter out system messages - they should never be sent to client
          const clientHistory = history.filter((msg) => msg.role !== "system");

          console.log(`Backend: Retrieved history:`, {
            hasHistory: !!history,
            messageCount: history?.length || 0,
            filteredMessages: clientHistory.length,
          });

          // Also check conversation object directly
          if (connectionInfo.conversation) {
            // Access the private _history array through any available method or property
            const convHistory =
              (connectionInfo.conversation as any)._history || [];
            console.log(`Backend: Conversation history:`, {
              messageCount: convHistory.length,
              messages: convHistory,
            });
          }

          // Send accumulated chunks from any active streams for this conversation
          console.log(
            `Backend: Checking for active streams to send accumulated chunks`
          );
          this.sendAccumulatedChunks(ws, connectionInfo.convId);

          this.sendToWebSocket(ws, {
            type: "control_response",
            id: message.id,
            data: {
              status: "history",
              history: clientHistory,
              type: control.type,
            },
            metadata: { timestamp: Date.now() },
          });
          console.log(
            `Backend: Sent history response (filtered out system messages)`
          );
          break;

        case "get_status":
          this.sendToWebSocket(ws, {
            type: "control_response",
            id: message.id,
            data: {
              status: "status_info",
              type: control.type,
              connectedAt: connectionInfo.connectedAt,
              messageCount: connectionInfo.messageCount,
              lastActivity: connectionInfo.lastActivity,
            },
            metadata: { timestamp: Date.now() },
          });
          break;

        default:
          this.sendError(
            ws,
            "UNKNOWN_CONTROL",
            `Unknown control type: ${control.type}`
          );
      }
    } catch (error: any) {
      this.sendError(ws, "CONTROL_ERROR", error.message);
    }
  }

  private handleConnectionClose(
    ws: ServerWebSocket,
    code: number,
    reason: string
  ): void {
    const connectionInfo = this.connections.get(ws);
    if (connectionInfo) {
      // Stop heartbeat
      this.stopHeartbeat(ws);

      // Clean up session
      this.sessions.delete(connectionInfo.sessionId);

      // Remove connection
      this.connections.delete(ws);

      this.emit("client_disconnected", {
        convId: connectionInfo.convId,
        sessionId: connectionInfo.sessionId,
        code,
        reason,
      });
    }
  }

  private async createConversation(
    initialHistory: any[] = [],
    convId: string
  ): Promise<Conversation> {
    const tools = await this.getDefaultTools(convId);
    const defaultSystemPrompt = `You are a helpful AI assistant connected via WebSocket.
You have access to tools that can help you provide better responses.
Always be helpful and conversational.`;

    // Check if initialHistory already contains a system message
    const hasSystemMessage = initialHistory.some(
      (msg) => msg.role === "system"
    );

    return new Conversation({
      systemPrompt: hasSystemMessage ? undefined : defaultSystemPrompt,
      initialHistory,
      tools,
      hooks: {
        tools: {
          before: async (toolCallId: string, toolName: string, args: any) => {
            console.log(`[Tool Hook] Before: ${toolName} (${toolCallId})`);
            // Get the assistant message ID from the connection info
            const connectionInfo = Array.from(this.connections.values()).find(
              (c) => c.convId === convId
            );
            const assistantMsgId = connectionInfo
              ? (connectionInfo as any).assistantMsgId
              : undefined;

            // Broadcast tool call start to all connections for this conversation
            this.broadcastToConv(convId, {
              type: "tool_call",
              id: toolCallId,
              data: {
                toolCallId,
                toolName,
                args,
                status: "calling",
                assistantMessageId: assistantMsgId, // Include assistant message ID
              },
              metadata: {
                timestamp: Date.now(),
                convId,
              },
            });
          },
          after: async (
            toolCallId: string,
            toolName: string,
            _args: any,
            result: any
          ) => {
            console.log(`[Tool Hook] After: ${toolName} (${toolCallId})`);
            // Broadcast tool result to all connections for this conversation
            this.broadcastToConv(convId, {
              type: "tool_result",
              id: toolCallId,
              data: {
                toolCallId,
                toolName,
                result,
              },
              metadata: {
                timestamp: Date.now(),
                convId,
              },
            });
          },
          error: async (
            toolCallId: string,
            toolName: string,
            _args: any,
            error: Error
          ) => {
            console.log(
              `[Tool Hook] Error: ${toolName} (${toolCallId}) - ${error.message}`
            );
            // Broadcast tool error to all connections for this conversation
            this.broadcastToConv(convId, {
              type: "tool_result",
              id: toolCallId,
              data: {
                toolCallId,
                toolName,
                result: { error: error.message },
              },
              metadata: {
                timestamp: Date.now(),
                convId,
              },
            });
          },
        },
      },
      ...this.options.conversationOptions,
    });
  }

  private async getDefaultTools(convId: string): Promise<Tool[]> {
    const tools = getBuiltinTools(convId);
    console.log(
      `Loaded ${tools.length} built-in tools for conversation ${convId}`
    );
    return tools;
  }

  private sendToWebSocket(ws: ServerWebSocket, message: WSMessage): boolean {
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  }

  private sendError(ws: ServerWebSocket, code: string, message: string): void {
    this.sendToWebSocket(ws, {
      type: "error",
      id: this.generateMessageId(),
      data: {
        code,
        message,
        recoverable: true,
      },
      metadata: { timestamp: Date.now() },
    });
  }

  private startHeartbeat(ws: ServerWebSocket): void {
    const timer = setInterval(() => {
      const connectionInfo = this.connections.get(ws);
      if (!connectionInfo) {
        return;
      }

      if (!connectionInfo.isAlive) {
        // Connection is dead, close it
        ws.terminate();
        return;
      }

      connectionInfo.isAlive = false;

      // Send ping
      this.sendToWebSocket(ws, {
        type: "ping",
        id: this.generateMessageId(),
        metadata: { timestamp: Date.now() },
      });
    }, this.options.heartbeatInterval);

    this.heartbeats.set(ws, timer);
  }

  private stopHeartbeat(ws: ServerWebSocket): void {
    const timer = this.heartbeats.get(ws);
    if (timer) {
      clearInterval(timer);
      this.heartbeats.delete(ws);
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

interface ConnectionInfo {
  convId: string;
  sessionId: string;
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
  isAlive: boolean;
  conversation?: Conversation;
  isProcessing?: boolean; // Track if a message is currently being processed
}
