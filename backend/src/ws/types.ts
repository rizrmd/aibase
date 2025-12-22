/**
 * Core WebSocket message types for bidirectional LLM communication
 */

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
  | 'user_message'
  | 'control'
  | 'ping'

  // Server to Client
  | 'llm_chunk'
  | 'llm_complete'
  | 'tool_call'
  | 'tool_result'
  | 'todo_update'
  | 'error'
  | 'control_response'
  | 'pong'
  | 'status'
  | 'notification';

// Control message types
export interface ControlMessage {
  type: 'abort' | 'pause' | 'resume' | 'clear_history' | 'get_history' | 'get_status' | 'compact_chat' | 'get_compaction_status';
  targetId?: string;
  data?: any;
}

// LLM related messages
export interface UserMessageData {
  text: string;
  fileIds?: string[]; // File IDs from HTTP upload
  options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: string[];
    thinking?: { type: "disabled" | "enabled" };
  };
}

export interface LLMChunkData {
  chunk: string;
  isComplete: boolean;
}

export interface LLMCompleteData {
  fullText: string;
  completionTime?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  maxTokens?: number;
}

export interface ToolCallData {
  toolCallId: string;
  toolName: string;
  args: any;
  status: 'start' | 'progress' | 'complete' | 'error';
  result?: any;
  error?: string;
}

// Status and error messages
export interface StatusData {
  status: 'connecting' | 'connected' | 'processing' | 'idle' | 'error' | 'disconnected';
  message?: string;
  details?: any;
}

export interface ErrorData {
  code: string;
  message: string;
  details?: any;
  recoverable: boolean;
}

// Configuration options
export interface WSClientOptions {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  timeout?: number;
  protocols?: string[];
}

export interface WSServerOptions {
  port?: number;
  hostname?: string;
  maxConnections?: number;
  heartbeatInterval?: number;
  enableCompression?: boolean;
  conversationOptions?: any;
}

// Event handler types
export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type ErrorEventHandler = (error: Error) => void | Promise<void>;

// Connection state
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

// Conversation session info
export interface SessionInfo {
  id: string;
  convId: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
}

// Statistics and monitoring
export interface ConnectionStats {
  connectedAt?: number;
  messagesSent: number;
  messagesReceived: number;
  lastMessageAt?: number;
  reconnectCount: number;
  averageLatency?: number;
}

// File related interfaces (files uploaded via HTTP)
export interface FileReference {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}