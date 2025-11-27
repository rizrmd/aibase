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
import { getBuiltinTools } from "../tools/builtin-tools";
import { getAllAvailableTools } from "../tools/conversation-tools";
import { WSEventEmitter } from "./events";
import { MessagePersistence } from "./message-persistence";

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

export class WSServer extends WSEventEmitter {
  private options: WSServerOptions;
  private connections = new Map<ServerWebSocket, ConnectionInfo>();
  private sessions = new Map<string, SessionInfo>();
  private heartbeats = new Map<ServerWebSocket, NodeJS.Timeout>();
  private messagePersistence: MessagePersistence;

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

      // Upgrade to WebSocket
      const upgraded = server.upgrade(req);
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
   * Send message to specific client
   */
  sendToClient(clientId: string, message: WSMessage): boolean {
    for (const [ws, connInfo] of this.connections) {
      if (connInfo.clientId === clientId) {
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
      if (connInfo.clientId !== excludeClientId) {
        if (this.sendToWebSocket(ws, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  private async handleConnectionOpen(ws: ServerWebSocket): Promise<void> {
    // Extract client ID from URL parameters if provided
    let urlClientId: string | null = null;

    try {
      // Extract client ID from the data passed during upgrade
      urlClientId = ws.data?.clientId || null;
    } catch (error) {
      console.warn("Failed to extract client ID from WebSocket data:", error);
    }

    // Use provided client ID or generate a new one
    const clientId = urlClientId || this.generateClientId();
    const sessionId = this.generateSessionId();

    const connectionInfo: ConnectionInfo = {
      clientId,
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
      clientId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
    };
    this.sessions.set(sessionId, sessionInfo);

    // Create conversation for this session with existing history
    const existingHistory = this.messagePersistence.getClientHistory(clientId);
    const conversation = await this.createConversation(existingHistory);
    connectionInfo.conversation = conversation;

    // Start heartbeat for this connection
    this.startHeartbeat(ws);

    // Send welcome message
    this.sendToWebSocket(ws, {
      type: "status",
      id: this.generateMessageId(),
      data: {
        status: "connected",
        message: "Connected to chat server",
        clientId,
        sessionId,
      },
      metadata: {
        timestamp: Date.now(),
        clientId,
        sessionId,
      },
    });

    this.emit("client_connected", { clientId, sessionId, ws });
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

    const userData = message.data as UserMessageData;

    // Process message asynchronously without blocking
    this.processUserMessageAsync(ws, connectionInfo, message, userData).catch(
      (error) => {
        console.error("Error processing user message:", error);
        this.sendError(ws, "PROCESSING_ERROR", error.message);
      }
    );
  }

  private async processUserMessageAsync(
    ws: ServerWebSocket,
    connectionInfo: ConnectionInfo,
    originalMessage: WSMessage,
    userData: UserMessageData
  ): Promise<void> {
    const conversation = connectionInfo.conversation;
    if (!conversation) return;

    try {
      // Send processing status
      this.sendToWebSocket(ws, {
        type: "status",
        id: this.generateMessageId(),
        data: { status: "processing", message: "Processing your message..." },
        metadata: { timestamp: Date.now() },
      });

      let fullResponse = "";

      // Process message with streaming - no timeouts
      for await (const chunk of conversation.sendMessage(userData.text)) {
        fullResponse += chunk;

        // Send chunk to client immediately
        this.sendToWebSocket(ws, {
          type: "llm_chunk",
          id: originalMessage.id,
          data: { chunk, isComplete: false },
          metadata: {
            timestamp: Date.now(),
            clientId: connectionInfo.clientId,
            sessionId: connectionInfo.sessionId,
          },
        });
      }

      // Send completion message
      this.sendToWebSocket(ws, {
        type: "llm_complete",
        id: originalMessage.id,
        data: { fullText: fullResponse },
        metadata: {
          timestamp: Date.now(),
          clientId: connectionInfo.clientId,
          sessionId: connectionInfo.sessionId,
        },
      });

      // Save updated conversation history to persistent storage
      const currentHistory = conversation.history;
      this.messagePersistence.setClientHistory(connectionInfo.clientId, currentHistory);
    } catch (error: any) {
      console.error("LLM Processing Error:", error);
      // Send error response but don't disconnect
      this.sendToWebSocket(ws, {
        type: "llm_chunk",
        id: originalMessage.id,
        data: {
          chunk:
            "I apologize, but I encountered an error processing your request. Please try again.",
          isComplete: false,
        },
        metadata: { timestamp: Date.now() },
      });

      this.sendToWebSocket(ws, {
        type: "llm_complete",
        id: originalMessage.id,
        data: {
          fullText:
            "I apologize, but I encountered an error processing your request. Please try again.",
        },
        metadata: { timestamp: Date.now() },
      });
    }
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
            conversation.abort();
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
            this.messagePersistence.clearClientHistory(connectionInfo.clientId);
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
          const history = this.messagePersistence.getClientHistory(connectionInfo.clientId);
          this.sendToWebSocket(ws, {
            type: "control_response",
            id: message.id,
            data: { status: "history", history, type: control.type },
            metadata: { timestamp: Date.now() },
          });
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
        clientId: connectionInfo.clientId,
        sessionId: connectionInfo.sessionId,
        code,
        reason,
      });
    }
  }

  private async createConversation(initialHistory: any[] = []): Promise<Conversation> {
    const tools = await this.getDefaultTools();
    return new Conversation({
      systemPrompt: `You are a helpful AI assistant connected via WebSocket.
You have access to tools that can help you provide better responses.
Always be helpful and conversational.`,
      initialHistory,
      tools,
      hooks: {},
      ...this.options.conversationOptions,
    });
  }

  private async getDefaultTools(): Promise<Tool[]> {
    try {
      // Try to get advanced tools first
      const advancedTools = await getAllAvailableTools();
      if (advancedTools.length > getBuiltinTools().length) {
        console.log(`Using advanced tool system with ${advancedTools.length} tools`);
        return advancedTools;
      }
    } catch (error) {
      console.warn('Failed to load advanced tools, falling back to basic tools:', error);
    }

    // Fallback to basic tools
    const basicTools = getBuiltinTools();
    return basicTools;
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
      if (connectionInfo && !connectionInfo.isAlive) {
        // Connection is dead, close it
        ws.terminate();
        return;
      }

      connectionInfo!.isAlive = false;

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
  clientId: string;
  sessionId: string;
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
  isAlive: boolean;
  conversation?: Conversation;
}
