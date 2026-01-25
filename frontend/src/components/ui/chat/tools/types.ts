export interface PartialToolCall {
  state: "partial-call";
  toolName: string;
  args?: Record<string, any>;
  toolCallId?: string;
  timestamp?: number;
  duration?: number;
  inspectionData?: Record<string, any>;
}

export interface ToolCall {
  state: "call";
  toolName: string;
  args?: Record<string, any>;
  toolCallId?: string;
  timestamp?: number;
  duration?: number;
  inspectionData?: Record<string, any>;
}

export interface ToolExecuting {
  state: "executing";
  toolName: string;
  args?: Record<string, any>;
  result?: {
    purpose?: string;
    code?: string;
    [key: string]: any;
  };
  toolCallId?: string;
  timestamp?: number;
  duration?: number;
  inspectionData?: Record<string, any>;
}

export interface ToolProgress {
  state: "progress";
  toolName: string;
  args?: Record<string, any>;
  result?: {
    message?: string;
    [key: string]: any;
  };
  toolCallId?: string;
  timestamp?: number;
  duration?: number;
  inspectionData?: Record<string, any>;
}

export interface ToolResult {
  state: "result";
  toolName: string;
  result: {
    __cancelled?: boolean;
    [key: string]: any;
  };
  args?: Record<string, any>;
  toolCallId?: string;
  timestamp?: number;
  duration?: number;
  inspectionData?: Record<string, any>;
}

export interface ToolError {
  state: "error";
  toolName: string;
  args?: Record<string, any>;
  error?: string;
  result?: any;
  toolCallId?: string;
  timestamp?: number;
  duration?: number;
  inspectionData?: Record<string, any>;
}

export type ToolInvocation =
  | PartialToolCall
  | ToolCall
  | ToolExecuting
  | ToolProgress
  | ToolResult
  | ToolError;

export interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
}
