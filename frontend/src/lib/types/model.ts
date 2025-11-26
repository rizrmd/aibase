export interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: number;
  isComplete: boolean;
  metadata?: {
    clientId?: string;
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
  clientId?: string;
  sessionId?: string;
}

export type MessageType =
  // Client to Server
  | "user_message"
  | "control"
  | "ping"
  | "file_upload"
  | "file_list"
  | "file_request"
  // Server to Client
  | "llm_chunk"
  | "llm_complete"
  | "tool_call"
  | "tool_result"
  | "error"
  | "control_response"
  | "pong"
  | "status"
  | "file_upload_response"
  | "file_list_response"
  | "file_content";

export interface UserMessageData {
  text: string;
  files?: MessageFile[];
  options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
  };
}

export interface LLMChunkData {
  chunk: string;
  isComplete?: boolean;
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
  clientId?: string;
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
  status?: "started" | "completed" | "error";
}

export interface ToolResultData {
  toolCallId: string;
  result: any;
}

// File related interfaces
export interface MessageFile {
  name: string;
  size: number;
  type: string;
  data?: string; // Base64 encoded file data
}

export interface FileUploadData {
  files: MessageFile[];
}

export interface FileUploadResponseData {
  success: boolean;
  uploaded?: MessageFile[];
  error?: string;
}

export interface FileListData {
  clientId?: string;
}

export interface FileListResponseData {
  success: boolean;
  files?: MessageFile[];
  error?: string;
}

export interface FileRequestData {
  fileName: string;
  asBase64?: boolean;
}

export interface FileContentData {
  success: boolean;
  fileName: string;
  content?: string;
  type?: string;
  error?: string;
}
