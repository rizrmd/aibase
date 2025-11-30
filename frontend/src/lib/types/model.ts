export interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: number;
  isComplete: boolean;
  metadata?: {
    convId?: string;
    sessionId?: string;
    sequence?: number;
  };
}

export interface WSMessage {
  type: MessageType;
  id: string;
  data?: any;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  timestamp: number;
  sequence?: number;
  total?: number;
  convId?: string;
  sessionId?: string;
  isAccumulated?: boolean;
}

export type MessageType =
  // Client to Server
  | "user_message"
  | "control"
  | "ping"
  // Server to Client
  | "llm_chunk"
  | "llm_complete"
  | "tool_call"
  | "tool_result"
  | "error"
  | "control_response"
  | "pong"
  | "status"
  | "todo_update";

export interface UserMessageData {
  text: string;
  fileIds?: string[]; // File IDs from upload, not file content
  options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
  };
}

export interface LLMChunkData {
  chunk: string;
  isComplete?: boolean;
  isAccumulated?: boolean; // Indicates if this chunk is from accumulated history
}

export interface StatusData {
  status:
    | "connecting"
    | "connected"
    | "processing"
    | "idle"
    | "error"
    | "disconnected"
    | "history"
    | "status_info"
    | "cleared"
    | "aborted";
  message?: string;
  details?: any;
  history?: any[]; // For chat history responses
  todos?: any; // For todo list responses
  type?: string; // For control response types
}

export interface ConnectionState {
  status:
    | "connecting"
    | "connected"
    | "disconnecting"
    | "disconnected"
    | "reconnecting"
    | "error";
  convId?: string;
  sessionId?: string;
  connectedAt?: number;
  messageCount: number;
}

// Enhanced types for the comprehensive WebSocket client
export interface ControlMessage {
  type: "abort" | "clear_history" | "get_history" | "get_status";
}

export interface ConnectionStats {
  messagesSent: number;
  messagesReceived: number;
  reconnectCount: number;
  connectedAt?: number;
  lastMessageAt?: number;
}

export interface WSClientOptions {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  timeout?: number;
  protocols?: string[];
}

export interface ToolCallData {
  toolCallId: string;
  toolName: string;
  args: any;
  status?: "start" | "progress" | "complete" | "error";
  result?: any; // For progress updates
  error?: string; // For error details
  assistantMessageId?: string; // ID of the assistant message this tool call belongs to
}

export interface ToolResultData {
  toolCallId: string;
  result: any;
}

// File reference interfaces (files uploaded via HTTP)
export interface FileReference {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}
