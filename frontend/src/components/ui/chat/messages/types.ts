import type { VariantProps } from "class-variance-authority";
import { chatBubbleVariants } from "../shared/variants";
import type { ToolInvocation, ToolInvocationPart } from "../tools/types";

// Re-export tool types for convenience
export type { ToolInvocation, ToolInvocationPart } from "../tools/types";

export type Animation = VariantProps<typeof chatBubbleVariants>["animation"];

export interface Attachment {
  name?: string;
  contentType?: string;
  url: string;
}

export interface ReasoningPart {
  type: "reasoning";
  reasoning: string;
}

export interface TextPart {
  type: "text";
  text: string;
}

// For compatibility with AI SDK types, not used
export interface SourcePart {
  type: "source";
  source?: any;
}

export interface FilePart {
  type: "file";
  mimeType: string;
  data: string;
}

export interface StepStartPart {
  type: "step-start";
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolInvocationPart
  | SourcePart
  | FilePart
  | StepStartPart;

export interface UploadedFileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
  description?: string;
  thumbnailUrl?: string;
  processingStatus?: string; // Processing status for this file (e.g., "Uploading...", "Analyzing...")
  timeElapsed?: number; // Time elapsed since processing started in seconds (e.g., 3, 5, 10)
}

export interface Message {
  id: string;
  role: "user" | "assistant" | (string & {});
  content: string;
  createdAt?: Date;
  experimental_attachments?: Attachment[];
  attachments?: UploadedFileAttachment[]; // Uploaded files from user
  toolInvocations?: ToolInvocation[];
  parts?: MessagePart[];
  completionTime?: number; // Time in seconds to complete the message (total duration)
  thinkingDuration?: number; // Time in seconds from user submit to first chunk
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }; // Token usage for this message
  isThinking?: boolean; // Temporary thinking indicator
  aborted?: boolean; // Message was aborted/cancelled
  uploadProgress?: number; // File upload progress percentage (0-100) for temporary upload progress message
}

export interface ChatMessageProps extends Omit<
  Message,
  "completionTime" | "thinkingDuration" | "isThinking" | "aborted" | "tokenUsage" | "uploadProgress"
> {
  showTimeStamp?: boolean;
  animation?: Animation;
  actions?: React.ReactNode;
  completionTime?: number;
  thinkingDuration?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isThinking?: boolean;
  aborted?: boolean;
  uploadProgress?: number;
}
