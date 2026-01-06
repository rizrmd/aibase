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
import type { ChatCompletionAssistantMessageParam } from "openai/resources/chat/completions";
import { Conversation, Tool } from "../llm/conversation";
import { getBuiltinTools } from "../tools";
import { WSEventEmitter } from "./events";
import { MessagePersistence } from "./msg-persistance";
import { detectAndStorePostgreSQLUrl } from "../llm/postgresql-detector";
import { getConversationInfo } from "../llm/conversation-info";
import { generateConversationTitle, getConversationTitle } from "../llm/conversation-title-generator";
import * as fs from "fs/promises";
import * as path from "path";
import { AuthService } from "../services/auth-service";

const authService = AuthService.getInstance();

// Extended message type with custom properties for persistence
interface ExtendedAssistantMessage extends ChatCompletionAssistantMessageParam {
  id?: string;
  completionTime?: number;
  thinkingDuration?: number;
  aborted?: boolean;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Use Bun's built-in WebSocket type for compatibility
// This matches Bun's ServerWebSocket interface
type ServerWebSocket = any; // Bun's ServerWebSocket type

// Streaming chunk accumulator for broadcasting to new connections
interface StreamingState {
  convId: string;
  messageId: string;
  chunks: string[];
  fullResponse: string;
  startTime: number;
  firstChunkTime?: number; // Time when first chunk arrived
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

    // Track first chunk time for thinking duration
    if (!stream.firstChunkTime) {
      stream.firstChunkTime = Date.now();
    }

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
  private processingConversations = new Set<string>(); // Track processing per conversation (not per connection)

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
      const projectId = url.searchParams.get("projectId");
      const token = url.searchParams.get("token");

      const upgraded = server.upgrade(req, { data: { convId, projectId, token } });
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
  private async sendAccumulatedChunks(ws: ServerWebSocket, convId: string, projectId: string): Promise<void> {
    const activeStreams = this.streamingManager.getActiveStreamsForConv(convId);

    console.log(
      `sendAccumulatedChunks: Found ${activeStreams.length} active streams for convId: ${convId}`
    );

    for (const stream of activeStreams) {
      // Always send accumulated chunks (or at least startTime) if there's an active stream
      // Even if fullResponse is empty, client needs startTime to show "Thinking... 0s"
      console.log(
        `Sending accumulated active stream: ${stream.messageId}, accumulated length: ${stream.fullResponse.length}`
      );
      this.sendToWebSocket(ws, {
        type: "llm_chunk",
        id: stream.messageId,
        data: {
          chunk: stream.fullResponse, // May be empty string if stream just started
          isComplete: false,
          isAccumulated: true,
          startTime: stream.startTime, // Include startTime for client interval calculation
        },
        metadata: {
          timestamp: stream.lastChunkTime,
          convId: stream.convId,
          isAccumulated: true,
        },
      });
    }

    // If there are no active streams but history has an incomplete message,
    // send a completion event to close it out on the frontend
    if (activeStreams.length === 0) {
      const history = await this.messagePersistence.getClientHistory(convId, projectId);
      const lastMessage = history[history.length - 1] as ExtendedAssistantMessage | undefined;

      if (lastMessage &&
        lastMessage.role === "assistant" &&
        !lastMessage.completionTime &&
        !lastMessage.aborted &&
        lastMessage.content) {
        console.log(
          `sendAccumulatedChunks: Found incomplete message in history without active stream, sending completion for ${lastMessage.id}`
        );
        this.sendToWebSocket(ws, {
          type: "llm_complete",
          id: lastMessage.id || this.generateMessageId(),
          data: {
            fullText: lastMessage.content,
            completionTime: 0,
          },
          metadata: {
            timestamp: Date.now(),
            convId,
          },
        });
      }
    }
  }

  private async handleConnectionOpen(ws: ServerWebSocket): Promise<void> {
    // Extract client ID and project ID from URL parameters if provided
    let urlClientId: string | null = null;
    let urlProjectId: string | null = null;

    try {
      // Extract client ID and project ID from the data passed during upgrade
      urlClientId = ws.data?.convId || null;
      urlProjectId = ws.data?.projectId || null;
    } catch (error) {
      console.warn("Failed to extract IDs from WebSocket data:", error);
    }

    // Extract authentication token from URL or protocol
    let token: string | null = null;
    try {
      // Try to get from URL params first (if available in ws.data or we need to parse upgradeReq url again? ws.data comes from upgrade)
      // Actually ws doesn't have easy access to original request URL here unless we passed it in data.
      // But typically we can pass token in protocol or query param during upgrade.
      // Bun's upgrade allows passing `data`. We should update handleHttpUpgrade to extract token and pass it in data.
      token = ws.data?.token || null;
    } catch (error) {
      console.warn("Failed to extract token:", error);
    }

    // Validate token if present
    let authenticatedUser = null;
    if (token) {
      authenticatedUser = await authService.validateSession(token);
      if (authenticatedUser) {
        console.log(`[WSServer] Authenticated user: ${authenticatedUser.username} (${authenticatedUser.id})`);
      } else {
        console.warn(`[WSServer] Invalid token provided: ${token}`);
        this.sendToWebSocket(ws, {
          type: "error",
          id: this.generateMessageId(),
          data: {
            code: "INVALID_TOKEN",
            message: "Invalid authentication token.",
          },
          metadata: { timestamp: Date.now() },
        });
        ws.close(1008, "Invalid token");
        return;
      }
    }

    // Use provided client ID or generate a new one
    const convId = urlClientId || this.generateClientId();
    const projectId = urlProjectId;

    // Project ID is required
    if (!projectId) {
      console.error("Project ID is required for WebSocket connection");
      this.sendToWebSocket(ws, {
        type: "error",
        id: this.generateMessageId(),
        data: {
          code: "MISSING_PROJECT_ID",
          message: "Project ID is required. Please select or create a project.",
        },
        metadata: { timestamp: Date.now() },
      });
      ws.close(1008, "Project ID required");
      return;
    }

    const sessionId = this.generateSessionId();

    console.log(`=== New Connection ===`);
    console.log(`convId: ${convId} (from URL: ${!!urlClientId})`);
    console.log(`projectId: ${projectId}`);
    console.log(
      `Total active streams in manager: ${Array.from(this.streamingManager["activeStreams"].keys()).length
      }`
    );
    console.log(
      `Active stream keys:`,
      Array.from(this.streamingManager["activeStreams"].keys())
    );

    const connectionInfo: ConnectionInfo = {
      convId,
      projectId,
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
    // Load from disk if available
    const existingHistory = await this.messagePersistence.getClientHistory(convId, projectId);
    const conversation = await this.createConversation(existingHistory, convId, projectId);
    connectionInfo.conversation = conversation;

    // Hook into conversation to persist changes to MessagePersistence
    const originalAddMessage = conversation.addMessage.bind(conversation);
    conversation.addMessage = (message: any) => {
      originalAddMessage(message);
      // Immediately persist the updated conversation history
      const history = (conversation as any)._history || [];
      this.messagePersistence.setClientHistory(convId, history, projectId);
    };

    // Start heartbeat for this connection
    this.startHeartbeat(ws);

    // Send accumulated chunks from active streams for this conversation
    await this.sendAccumulatedChunks(ws, convId, projectId);

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

    // Check if already processing a message for this conversation
    if (this.processingConversations.has(connectionInfo.convId)) {
      console.log(`[UserMessage] Already processing a message for convId: ${connectionInfo.convId}, ignoring duplicate`);
      return;
    }

    const userData = message.data as UserMessageData;

    // Mark conversation as processing
    this.processingConversations.add(connectionInfo.convId);

    // Process message asynchronously without blocking
    this.processUserMessageAsync(ws, connectionInfo, message, userData)
      .catch((error) => {
        console.error("Error processing user message:", error);
        this.sendError(ws, "PROCESSING_ERROR", error.message);
      })
      .finally(() => {
        // Clear processing flag when done
        this.processingConversations.delete(connectionInfo.convId);
      });
  }

  private async processUserMessageAsync(
    _ws: ServerWebSocket,
    connectionInfo: ConnectionInfo,
    _originalMessage: WSMessage,
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

    // Apply per-message options if provided
    const originalModelParams = { ...(conversation as any).modelParams };

    if (userData.options) {
      const messageModelParams: any = {};

      if (userData.options.temperature !== undefined) {
        messageModelParams.temperature = userData.options.temperature;
      }
      if (userData.options.maxTokens !== undefined) {
        messageModelParams.max_tokens = userData.options.maxTokens;
      }
      if (userData.options.thinking !== undefined) {
        messageModelParams.thinking = userData.options.thinking;
      }

      // Merge with existing params (per-message options take precedence)
      (conversation as any).modelParams = {
        ...originalModelParams,
        ...messageModelParams,
      };
    }

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

        // Add chunk to streaming manager
        this.streamingManager.addChunk(
          connectionInfo.convId,
          assistantMsgId,
          chunk
        );

        // Create chunk message with start time
        const chunkMessage = {
          type: "llm_chunk" as const,
          id: assistantMsgId,
          data: {
            chunk,
            isComplete: false,
            startTime: startTime, // Send the original start time
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

      // Get stream state to calculate thinking duration
      const stream = this.streamingManager.getStream(connectionInfo.convId, assistantMsgId);
      let thinkingDurationSeconds: number | undefined;
      if (stream?.firstChunkTime) {
        const thinkingDurationMs = stream.firstChunkTime - startTime;
        thinkingDurationSeconds = Math.floor(thinkingDurationMs / 1000);
        console.log(
          `[Backend Complete] Thinking duration: ${thinkingDurationSeconds}s (${thinkingDurationMs}ms)`
        );
      }

      // Get conversation info to retrieve token usage
      const convInfo = await getConversationInfo(
        connectionInfo.convId,
        connectionInfo.projectId
      );
      const tokenUsage = convInfo?.tokenUsage?.total;

      console.log(`[Backend Complete] convInfo:`, convInfo);
      console.log(`[Backend Complete] tokenUsage from convInfo:`, tokenUsage);

      // Get max tokens from environment variable
      const maxTokens = process.env.OPENAI_MAX_TOKEN
        ? parseInt(process.env.OPENAI_MAX_TOKEN, 10)
        : undefined;

      console.log(`[Backend Complete] maxTokens from env:`, maxTokens);

      // Send completion message to all connections for this conversation
      const completionMessage = {
        type: "llm_complete" as const,
        id: assistantMsgId,
        data: {
          fullText: fullResponse,
          completionTime: completionTimeSeconds,
          thinkingDuration: thinkingDurationSeconds,
          tokenUsage: tokenUsage
            ? {
              promptTokens: tokenUsage.promptTokens,
              completionTokens: tokenUsage.completionTokens,
              totalTokens: tokenUsage.totalTokens,
              messageCount: convInfo?.totalMessages || 0,
            }
            : undefined,
          maxTokens,
        },
        metadata: {
          timestamp: Date.now(),
          convId: connectionInfo.convId,
        },
      };
      console.log(
        `[Backend Complete] Broadcasting completion message with ${fullResponse.length} chars, completionTime: ${completionTimeSeconds}s, tokens: ${tokenUsage?.totalTokens || "N/A"}, maxTokens: ${maxTokens}`
      );
      console.log(`[Backend Complete] Full completion message data:`, JSON.stringify(completionMessage.data, null, 2));
      this.broadcastToConv(connectionInfo.convId, completionMessage);

      // Save updated conversation history to persistent storage with message IDs
      const currentHistory = conversation.history;

      // Add message IDs, completionTime, and tokenUsage to the last user and assistant messages
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
            ...(thinkingDurationSeconds !== undefined && { thinkingDuration: thinkingDurationSeconds }),
            ...(tokenUsage && {
              tokenUsage: {
                promptTokens: tokenUsage.promptTokens,
                completionTokens: tokenUsage.completionTokens,
                totalTokens: tokenUsage.totalTokens,
              }
            }),
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
        historyWithIds,
        connectionInfo.projectId
      );

      // Verify it was saved
      const savedHistory = await this.messagePersistence.getClientHistory(
        connectionInfo.convId,
        connectionInfo.projectId
      );
      console.log(
        `[Backend Complete] Verification: Saved history has ${savedHistory.length} messages`
      );

      // FIX: Mark stream as complete AFTER broadcasting completion and saving history
      // This prevents sendAccumulatedChunks from sending stale/incomplete data to new connections
      this.streamingManager.completeStream(
        connectionInfo.convId,
        assistantMsgId
      );

      // Generate conversation title asynchronously after first assistant response
      // Don't wait for it to complete - let it run in the background
      this.generateTitleIfNeeded(connectionInfo.convId, connectionInfo.projectId, historyWithIds)
        .catch((error) => {
          console.error(`[TitleGeneration] Error generating title for ${connectionInfo.convId}:`, error);
        });

      // Check if compaction is needed (automatic)
      try {
        const compactionResult = await this.messagePersistence.checkAndCompact(
          connectionInfo.projectId,
          connectionInfo.convId
        );
        if (compactionResult.compacted) {
          console.log(
            `[Auto-Compaction] Compacted chat for ${connectionInfo.convId}, saved ~${compactionResult.tokensSaved} tokens`
          );
          // Optionally notify all clients about the compaction
          this.broadcastToConv(connectionInfo.convId, {
            type: "notification",
            id: `compaction_${Date.now()}`,
            data: {
              message: `Chat history compacted. Saved approximately ${compactionResult.tokensSaved} tokens.`,
              severity: "info",
            },
            metadata: { timestamp: Date.now() },
          });
        }
      } catch (error: any) {
        console.error(`[Auto-Compaction] Error:`, error);
        // Don't fail the main flow if compaction fails
      }

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
          this.messagePersistence.setClientHistory(connectionInfo.convId, historyWithIds, connectionInfo.projectId);
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
    } finally {
      // Restore original modelParams after message completes
      if (userData.options) {
        (conversation as any).modelParams = originalModelParams;
      }
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
            this.processingConversations.delete(connectionInfo.convId);

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
            this.messagePersistence.clearClientHistory(connectionInfo.convId, connectionInfo.projectId);
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
          const history = await this.messagePersistence.getClientHistory(
            connectionInfo.convId,
            connectionInfo.projectId
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

          // Load todos for this conversation
          let todos = null;
          try {
            const todosPath = path.join(
              process.cwd(),
              "data",
              connectionInfo.projectId,
              connectionInfo.convId,
              "todos.json"
            );
            const todosContent = await fs.readFile(todosPath, "utf-8");
            todos = JSON.parse(todosContent);
            console.log(`Backend: Loaded todos for convId ${connectionInfo.convId}:`, {
              todoCount: todos?.items?.length || 0,
            });
          } catch (error) {
            // No todos file exists yet, which is fine
            console.log(`Backend: No todos found for convId ${connectionInfo.convId}`);
          }

          // Send accumulated chunks from any active streams for this conversation
          console.log(
            `Backend: Checking for active streams to send accumulated chunks`
          );
          await this.sendAccumulatedChunks(ws, connectionInfo.convId, connectionInfo.projectId);

          // Check if there are active streams for this conversation
          const activeStreams = this.streamingManager.getActiveStreamsForConv(connectionInfo.convId);
          const hasActiveStream = activeStreams.length > 0;
          console.log(`Backend: hasActiveStream for ${connectionInfo.convId}: ${hasActiveStream} (${activeStreams.length} streams)`);

          // Get max tokens from environment variable
          const maxTokens = process.env.OPENAI_MAX_TOKEN
            ? parseInt(process.env.OPENAI_MAX_TOKEN, 10)
            : undefined;

          // Get conversation info for token usage totals
          const convInfo = await getConversationInfo(
            connectionInfo.convId,
            connectionInfo.projectId
          );
          const totalTokenUsage = convInfo?.tokenUsage?.total;

          this.sendToWebSocket(ws, {
            type: "control_response",
            id: message.id,
            data: {
              status: "history",
              history: clientHistory,
              todos: todos,
              hasActiveStream: hasActiveStream, // Tell frontend if streaming is active
              maxTokens: maxTokens, // Include max tokens for frontend
              tokenUsage: totalTokenUsage ? {
                promptTokens: totalTokenUsage.promptTokens,
                completionTokens: totalTokenUsage.completionTokens,
                totalTokens: totalTokenUsage.totalTokens,
                messageCount: convInfo?.totalMessages || 0,
              } : undefined, // Total cumulative token usage from info.json
              type: control.type,
            },
            metadata: { timestamp: Date.now() },
          });
          console.log(
            `Backend: Sent history response (filtered out system messages) with todos`
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

        case "compact_chat":
          console.log(`[Compaction] Manual compaction requested for convId: ${connectionInfo.convId}`);
          try {
            const compactionResult = await this.messagePersistence.checkAndCompact(
              connectionInfo.projectId,
              connectionInfo.convId
            );

            this.sendToWebSocket(ws, {
              type: "control_response",
              id: message.id,
              data: {
                status: "compacted",
                type: control.type,
                compacted: compactionResult.compacted,
                newChatFile: compactionResult.newChatFile,
                tokensSaved: compactionResult.tokensSaved,
              },
              metadata: { timestamp: Date.now() },
            });

            console.log(`[Compaction] Result:`, compactionResult);
          } catch (error: any) {
            console.error(`[Compaction] Error:`, error);
            this.sendError(ws, "COMPACTION_ERROR", error.message);
          }
          break;

        case "get_compaction_status":
          console.log(`[Compaction] Status requested for convId: ${connectionInfo.convId}`);
          try {
            const status = await this.messagePersistence.getCompactionStatus(
              connectionInfo.projectId || "A1",
              connectionInfo.convId
            );

            this.sendToWebSocket(ws, {
              type: "control_response",
              id: message.id,
              data: {
                status: "compaction_status",
                type: control.type,
                ...status,
              },
              metadata: { timestamp: Date.now() },
            });

            console.log(`[Compaction] Status:`, status);
          } catch (error: any) {
            console.error(`[Compaction] Error getting status:`, error);
            this.sendError(ws, "COMPACTION_STATUS_ERROR", error.message);
          }
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
    convId: string,
    projectId: string
  ): Promise<Conversation> {
    const tools = await this.getDefaultTools(convId, projectId);
    const defaultSystemPrompt = `You are a helpful AI assistant connected via WebSocket.
You have access to tools that can help you provide better responses.
Always be helpful and conversational.`;

    // Check if initialHistory already contains a system message
    const hasSystemMessage = initialHistory.some(
      (msg) => msg.role === "system"
    );

    // Read thinking mode from environment (default: disabled)
    const thinkingMode = process.env.OPENAI_THINKING_MODE?.toLowerCase() === "enabled"
      ? { type: "enabled" as const }
      : { type: "disabled" as const };

    return await Conversation.create({
      systemPrompt: hasSystemMessage ? undefined : defaultSystemPrompt,
      initialHistory,
      tools,
      convId,
      projectId,
      thinking: thinkingMode,
      hooks: {
        message: {
          before: async (message: string) => {
            // Detect PostgreSQL URLs and test/store them in memory
            const result = await detectAndStorePostgreSQLUrl(message, projectId);

            if (result.detected) {
              if (result.stored) {
                console.log(`[PostgreSQL] Successfully stored connection URL for conversation ${convId}`);
              } else {
                console.log(`[PostgreSQL] Failed to store connection URL: ${result.error}`);
              }
            }
          },
        },
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

            // Extract status and result if passed from script tool
            // Use "executing" for regular tools to match frontend expectations
            const status = args.__status || "executing";
            const result = args.__result;

            // Clean args by removing internal fields
            const cleanArgs = { ...args };
            delete cleanArgs.__status;
            delete cleanArgs.__result;

            // Broadcast tool call to all connections for this conversation
            this.broadcastToConv(convId, {
              type: "tool_call",
              id: toolCallId,
              data: {
                toolCallId,
                toolName,
                args: cleanArgs,
                status,
                result,
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

  private async getDefaultTools(convId: string, projectId: string): Promise<Tool[]> {
    const tools = getBuiltinTools(convId, projectId);

    // Set up broadcast callback for TodoTool
    const todoTool = tools.find(t => t.name === "todo");
    if (todoTool && "setBroadcastCallback" in todoTool) {
      (todoTool as any).setBroadcastCallback((convId: string, todos: any) => {
        this.broadcastTodoUpdate(convId, todos);
      });
    }

    console.log(
      `Loaded ${tools.length} built-in tools for conversation ${convId} in project ${projectId}`
    );
    return tools;
  }

  /**
   * Broadcast todo updates to all connections for a conversation
   */
  private broadcastTodoUpdate(convId: string, todos: any): void {
    console.log(`[TodoUpdate] Broadcasting todo update for convId: ${convId}`);
    this.broadcastToConv(convId, {
      type: "todo_update",
      id: this.generateMessageId(),
      data: { todos },
      metadata: {
        timestamp: Date.now(),
        convId,
      },
    });
  }

  /**
   * Generate conversation title if needed (after first message)
   * Runs asynchronously in the background
   */
  private async generateTitleIfNeeded(
    convId: string,
    projectId: string,
    history: any[]
  ): Promise<void> {
    try {
      // Check if title already exists
      const existingTitle = await getConversationTitle(convId, projectId);
      if (existingTitle) {
        console.log(`[TitleGeneration] Title already exists for ${convId}: "${existingTitle}"`);
        return;
      }

      // Count non-system messages to determine if we should generate a title
      const nonSystemMessages = history.filter((msg: any) => msg.role !== "system");

      // Generate title after first user-assistant exchange (at least 2 non-system messages)
      if (nonSystemMessages.length >= 2) {
        console.log(`[TitleGeneration] Generating title for ${convId} with ${nonSystemMessages.length} messages...`);

        // Generate title using AI
        const title = await generateConversationTitle(history, convId, projectId);

        console.log(`[TitleGeneration] Generated title for ${convId}: "${title}"`);
        // Title is automatically saved to info.json by generateConversationTitle
        // It will appear in conversation list when loaded from API
      } else {
        console.log(`[TitleGeneration] Skipping title generation for ${convId} - not enough messages yet (${nonSystemMessages.length}/2)`);
      }
    } catch (error) {
      console.error(`[TitleGeneration] Failed to generate title for ${convId}:`, error);
      // Don't throw - title generation is non-critical
    }
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
  projectId: string;
  sessionId: string;
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
  isAlive: boolean;
  conversation?: Conversation;
}
