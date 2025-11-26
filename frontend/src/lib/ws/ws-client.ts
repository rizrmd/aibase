/**
 * Enhanced WebSocket client for bidirectional LLM communication
 * Incorporates robust features from the original implementation
 */

import type {
  WSMessage,
  WSClientOptions,
  ConnectionState,
  ConnectionStats,
  UserMessageData,
  ControlMessage,
  MessageType,
  ToolCallData,
  ToolResultData,
} from "../types/model";

import { WSEventEmitter } from "./ws-emitter";

export class WSClient extends WSEventEmitter {
  private ws: WebSocket | null = null;
  private options: Required<WSClientOptions>;
  private state: ConnectionState = {
    status: "disconnected",
    messageCount: 0,
  };
  private stats: ConnectionStats = {
    messagesSent: 0,
    messagesReceived: 0,
    reconnectCount: 0,
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: WSMessage[] = [];
  private messageId = 0;
  private pendingMessages = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      timeout: ReturnType<typeof setTimeout> | null;
    }
  >();

  constructor(options: WSClientOptions) {
    super();
    this.options = {
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      timeout: 10000,
      protocols: [],
      ...options,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (
      this.state.status === "connecting" ||
      this.state.status === "connected"
    ) {
      return;
    }

    this.setState("connecting");

    // Get or generate client ID and include it in the URL
    const clientId = this.getClientId();
    const url = new URL(this.options.url);
    url.searchParams.set("clientId", clientId);
    const finalUrl = url.toString();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          // If WebSocket is open but 'connected' event hasn't fired, resolve anyway
          this.setState("connected");
          this.startHeartbeat();
          this.emit("connected");
          resolve();
        } else {
          reject(new Error("Connection timeout"));
        }
      }, this.options.timeout);

      try {
        this.ws = new WebSocket(finalUrl, this.options.protocols);
        this.setupWebSocketHandlers();

        this.once("connected", () => {
          clearTimeout(timeout);
          resolve();
        });

        this.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      } catch (error) {
        clearTimeout(timeout);
        this.setState("error");
        this.emit("error", error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.clearPendingMessages();
    this.setState("disconnecting");

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.setState("disconnected");
  }

  /**
   * Send user message to server
   */
  async sendMessage(
    text: string,
    options?: UserMessageData["options"]
  ): Promise<any> {
    const message: WSMessage = {
      type: "user_message",
      id: this.generateMessageId(),
      data: { text, ...options },
      metadata: {
        timestamp: Date.now(),
        clientId: this.getClientId(),
      },
    };

    return this.sendMessageAndWaitForResponse(message, "llm_complete");
  }

  /**
   * Send control message
   */
  sendControl(control: ControlMessage): void {
    const message: WSMessage = {
      type: "control",
      id: this.generateMessageId(),
      data: control,
      metadata: {
        timestamp: Date.now(),
        clientId: this.getClientId(),
      },
    };

    this.send(message);
  }

  /**
   * Abort current message processing
   */
  abort(): void {
    this.sendControl({ type: "abort" });
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.sendControl({ type: "clear_history" });
  }

  /**
   * Get conversation history
   */
  getHistory(): void {
    this.sendControl({ type: "get_history" });
  }

  /**
   * Get current status
   */
  getStatus(): void {
    this.sendControl({ type: "get_status" });
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return (
      this.state.status === "connected" &&
      this.ws?.readyState === WebSocket.OPEN
    );
  }

  private async setupWebSocketHandlers(): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve) => {
      this.ws!.onopen = () => {
        this.stats.connectedAt = Date.now();
        this.stats.reconnectCount = 0;
        this.setState("connected");
        this.startHeartbeat();
        this.flushMessageQueue();
        this.emit("connected");
        resolve();
      };

      this.ws!.onmessage = async (event) => {
        this.stats.messagesReceived++;
        this.stats.lastMessageAt = Date.now();

        console.log("WSClient: Raw WebSocket message received:", event.data);

        try {
          const message: WSMessage = JSON.parse(event.data);
          console.log(
            "WSClient: Parsed message:",
            message.type,
            message.id,
            message.data
          );
          await this.handleMessage(message);
        } catch (error) {
          console.error(
            "WSClient: Failed to parse message:",
            error,
            "Raw data:",
            event.data
          );
          this.emit("error", new Error("Invalid message format"));
        }
      };

      this.ws!.onclose = (event) => {
        this.clearHeartbeat();
        this.clearPendingMessages(); // Clear pending messages on close
        this.setState("disconnected");
        this.emit("disconnected", { code: event.code, reason: event.reason });

        if (!event.wasClean && this.options.reconnectAttempts > 0) {
          this.attemptReconnect();
        }
      };

      this.ws!.onerror = (error) => {
        this.setState("error");
        this.emit("error", new Error("WebSocket connection error"));
      };
    });
  }

  private async handleMessage(message: WSMessage): Promise<void> {
    // Handle pending message responses
    if (message.type && this.pendingMessages.has(message.id)) {
      const pending = this.pendingMessages.get(message.id)!;
      if (pending.timeout) clearTimeout(pending.timeout);
      this.pendingMessages.delete(message.id);
      pending.resolve(message.data);
      return;
    }

    // Emit specific message events
    switch (message.type) {
      case "llm_chunk":
        console.log("WSClient: Emitting llm_chunk:", message.data?.chunk);
        this.emit("llm_chunk", {
          chunk: message.data?.chunk || "",
          sequence: message.metadata?.sequence,
        });
        break;

      case "llm_complete":
        this.emit("llm_complete", {
          fullText: message.data?.fullText || "",
          messageId: message.id,
        });
        break;

      case "tool_call":
        this.emit("tool_call", {
          toolCallId: message.data?.toolCallId,
          toolName: message.data?.toolName,
          args: message.data?.args,
          status: message.data?.status,
        } as ToolCallData);
        break;

      case "tool_result":
        this.emit("tool_result", {
          toolCallId: message.data?.toolCallId,
          result: message.data?.result,
        } as ToolResultData);
        break;

      case "error":
        this.emit("communication_error", {
          code: message.data?.code || "UNKNOWN",
          message: message.data?.message || "Unknown error",
        });
        break;

      case "control_response":
        this.emit("control", message.data);
        break;

      case "status":
        // Store client and session IDs from server response
        if (message.data?.clientId) {
          this.setClientId(message.data.clientId);
        }
        if (message.data?.sessionId) {
          this.state.sessionId = message.data.sessionId;
        }
        this.emit("status", message.data);
        break;

      case "pong":
        // Heartbeat response
        break;

      default:
        this.emit("message", message);
    }
  }

  public send(message: WSMessage): void {
    console.log(
      "WSClient: Attempting to send message:",
      message.type,
      message.id
    );
    console.log("WSClient: Connected?", this.isConnected());
    console.log("WSClient: WebSocket state:", this.ws?.readyState);

    if (this.isConnected()) {
      console.log("WSClient: Sending via WebSocket");
      this.ws!.send(JSON.stringify(message));
      this.stats.messagesSent++;
      this.stats.lastMessageAt = Date.now();
    } else {
      console.log(
        "WSClient: Not connected, queuing message. Queue length:",
        this.messageQueue.length
      );
      // Queue message for when connection is restored
      this.messageQueue.push(message);
    }
  }

  private async sendMessageAndWaitForResponse(
    message: WSMessage,
    responseType: MessageType
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(message.id);
        reject(new Error("Message response timeout"));
      }, 60000); // 60 second timeout

      this.pendingMessages.set(message.id, {
        resolve,
        reject,
        timeout,
      });

      this.send(message);
    });
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: "ping",
          id: this.generateMessageId(),
          metadata: { timestamp: Date.now() },
        });
      }
    }, this.options.heartbeatInterval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearPendingMessages(): void {
    for (const [messageId, pending] of this.pendingMessages.entries()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error("Connection closed"));
    }
    this.pendingMessages.clear();
  }

  private attemptReconnect(): void {
    if (this.stats.reconnectCount >= this.options.reconnectAttempts) {
      this.emit("error", new Error("Maximum reconnection attempts exceeded"));
      return;
    }

    this.setState("reconnecting");
    this.stats.reconnectCount++;

    this.emit("reconnecting", {
      attempt: this.stats.reconnectCount,
      maxAttempts: this.options.reconnectAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Will retry again if attempt allows
        this.attemptReconnect();
      });
    }, this.options.reconnectDelay * Math.pow(2, this.stats.reconnectCount - 1));
  }

  private setState(newState: ConnectionState["status"]): void {
    if (this.state.status !== newState) {
      const oldState = this.state.status;
      this.state.status = newState;
      this.state.messageCount =
        this.stats.messagesSent + this.stats.messagesReceived;
      this.emit("status_change", { oldState, newState });
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageId}`;
  }

  private getClientId(): string {
    // Generate or retrieve a persistent client ID
    if (typeof window !== "undefined") {
      // Browser environment
      let clientId = localStorage.getItem("ws_client_id");
      if (!clientId) {
        clientId = `client_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 11)}`;
        localStorage.setItem("ws_client_id", clientId);
      }
      return clientId;
    } else {
      // Node.js environment
      return `client_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 11)}`;
    }
  }

  private setClientId(clientId: string): void {
    // Store the client ID (useful when server assigns one)
    if (typeof window !== "undefined") {
      localStorage.setItem("ws_client_id", clientId);
    }
    // Update the connection state
    this.state.clientId = clientId;
  }
}
