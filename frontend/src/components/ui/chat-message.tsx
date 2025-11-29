import React, { useMemo, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Ban, ChevronRight, Code2, Loader2, Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FilePreview } from "@/components/ui/file-preview";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

const chatBubbleVariants = cva(
  "group/message relative break-words rounded-lg p-3 text-sm sm:max-w-[70%]",
  {
    variants: {
      isUser: {
        true: "bg-primary text-primary-foreground",
        false: "bg-muted text-foreground",
      },
      animation: {
        none: "",
        slide: "duration-300 animate-in fade-in-0",
        scale: "duration-300 animate-in fade-in-0 zoom-in-75",
        fade: "duration-500 animate-in fade-in-0",
      },
    },
    compoundVariants: [
      {
        isUser: true,
        animation: "slide",
        class: "slide-in-from-right",
      },
      {
        isUser: false,
        animation: "slide",
        class: "slide-in-from-left",
      },
      {
        isUser: true,
        animation: "scale",
        class: "origin-bottom-right",
      },
      {
        isUser: false,
        animation: "scale",
        class: "origin-bottom-left",
      },
    ],
  }
);

type Animation = VariantProps<typeof chatBubbleVariants>["animation"];

interface Attachment {
  name?: string;
  contentType?: string;
  url: string;
}

interface PartialToolCall {
  state: "partial-call";
  toolName: string;
  args?: Record<string, any>;
}

interface ToolCall {
  state: "call";
  toolName: string;
  args?: Record<string, any>;
}

interface ToolResult {
  state: "result";
  toolName: string;
  result: {
    __cancelled?: boolean;
    [key: string]: any;
  };
  args?: Record<string, any>;
}

type ToolInvocation = PartialToolCall | ToolCall | ToolResult;

interface ReasoningPart {
  type: "reasoning";
  reasoning: string;
}

interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
}

interface TextPart {
  type: "text";
  text: string;
}

// For compatibility with AI SDK types, not used
interface SourcePart {
  type: "source";
  source?: any;
}

interface FilePart {
  type: "file";
  mimeType: string;
  data: string;
}

interface StepStartPart {
  type: "step-start";
}

type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolInvocationPart
  | SourcePart
  | FilePart
  | StepStartPart;

export interface Message {
  id: string;
  role: "user" | "assistant" | (string & {});
  content: string;
  createdAt?: Date;
  experimental_attachments?: Attachment[];
  toolInvocations?: ToolInvocation[];
  parts?: MessagePart[];
  completionTime?: number; // Time in seconds to complete the message
  isThinking?: boolean; // Temporary thinking indicator
  aborted?: boolean; // Message was aborted/cancelled
}

export interface ChatMessageProps extends Omit<Message, 'completionTime' | 'isThinking' | 'aborted'> {
  showTimeStamp?: boolean;
  animation?: Animation;
  actions?: React.ReactNode;
  completionTime?: number;
  isThinking?: boolean;
  aborted?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  createdAt,
  showTimeStamp = true,
  animation = "scale",
  actions,
  experimental_attachments,
  toolInvocations,
  parts,
  completionTime,
  isThinking,
  aborted,
  ...props
}) => {
  const files = useMemo(() => {
    return experimental_attachments?.map((attachment) => {
      const dataArray = dataUrlToUint8Array(attachment.url);
      const file = new File([dataArray], attachment.name ?? "Unknown", {
        type: attachment.contentType,
      });
      return file;
    });
  }, [experimental_attachments]);

  const isUser = role === "user";

  const formattedTime = createdAt?.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Debug: Log completion time for assistant messages
  if (role === "assistant" && !isThinking) {
    console.log(`[ChatMessage] Assistant message:`, {
      role,
      hasCompletionTime: completionTime !== undefined,
      completionTime,
      showTimeStamp,
      createdAt: !!createdAt
    });
  }

  // If this is a thinking indicator, show animated thinking message
  if (isThinking) {
    return (
      <div className="flex items-start gap-2">
        <div className={cn(chatBubbleVariants({ isUser: false, animation }))}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-muted-foreground">{content}</span>
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div
        className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
      >
        {files ? (
          <div className="mb-1 flex flex-wrap gap-2">
            {files.map((file, index) => {
              return <FilePreview file={file} key={index} />;
            })}
          </div>
        ) : null}

        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>

        {showTimeStamp && createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 block px-1 text-xs opacity-50",
              animation !== "none" && "duration-500 animate-in fade-in-0"
            )}
          >
            {formattedTime}
          </time>
        ) : null}
      </div>
    );
  }

  if (parts && parts.length > 0) {
    return parts.map((part, index) => {
      if (part.type === "text") {
        return (
          <div
            className={cn(
              "flex flex-col",
              isUser ? "items-end" : "items-start"
            )}
            key={`text-${index}`}
          >
            <div className={cn(chatBubbleVariants({ isUser, animation }))}>
              <MarkdownRenderer>{part.text}</MarkdownRenderer>
              {actions ? (
                <div className="absolute -bottom-4 right-2 flex space-x-1 rounded-lg border bg-background p-1 text-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
                  {actions}
                </div>
              ) : null}
            </div>

            {showTimeStamp && createdAt ? (
              <time
                dateTime={createdAt.toISOString()}
                className={cn(
                  "mt-1 block px-1 text-xs opacity-50",
                  animation !== "none" && "duration-500 animate-in fade-in-0"
                )}
              >
                {formattedTime}
              </time>
            ) : null}
          </div>
        );
      } else if (part.type === "reasoning") {
        return <ReasoningBlock key={`reasoning-${index}`} part={part} />;
      } else if (part.type === "tool-invocation") {
        return (
          <ToolCall
            key={`tool-${index}`}
            toolInvocations={[part.toolInvocation]}
          />
        );
      }
      return null;
    });
  }

  // Debug logging
  if (!isUser) {
    console.log("[ChatMessage Render] Assistant message:", {
      hasContent: !!content,
      contentLength: content?.length || 0,
      hasToolInvocations: !!toolInvocations,
      toolInvocationsLength: toolInvocations?.length || 0,
      toolInvocations: toolInvocations,
    });
  }

  // Split content at first meaningful newline (skip leading newlines) if we have tool invocations
  const shouldSplitContent = !isUser && toolInvocations && toolInvocations.length > 0;
  let beforeToolContent = '';
  let afterToolContent = content;

  if (shouldSplitContent && content.includes('\n')) {
    // Trim leading whitespace to find the actual content start
    const trimmedContent = content.trimStart();
    const firstNewline = trimmedContent.indexOf('\n');

    if (firstNewline !== -1) {
      // Find where the first paragraph ends (double newline or single newline followed by content)
      const doubleNewline = trimmedContent.indexOf('\n\n');

      if (doubleNewline !== -1 && doubleNewline < 200) {
        // Split at paragraph break
        beforeToolContent = trimmedContent.substring(0, doubleNewline).trim();
        afterToolContent = trimmedContent.substring(doubleNewline).trim();
      } else {
        // Split at first newline
        beforeToolContent = trimmedContent.substring(0, firstNewline).trim();
        afterToolContent = trimmedContent.substring(firstNewline).trim();
      }
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start"
      )}
    >
      {/* Render content before tools */}
      {shouldSplitContent && beforeToolContent && (
        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{beforeToolContent}</MarkdownRenderer>
        </div>
      )}

      {/* Render tool invocations */}
      {toolInvocations && toolInvocations.length > 0 && (
        <ToolCall toolInvocations={toolInvocations} />
      )}

      {/* Render content after tools (or all content if not split) */}
      {((shouldSplitContent && afterToolContent) || (!shouldSplitContent && content && content.trim())) && (
        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{shouldSplitContent ? afterToolContent : content}</MarkdownRenderer>
          {actions ? (
            <div className="absolute -bottom-4 right-2 flex space-x-1 rounded-lg border bg-background p-1 text-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
              {actions}
            </div>
          ) : null}
        </div>
      )}

      {showTimeStamp && createdAt ? (
        <time
          dateTime={createdAt.toISOString()}
          className={cn(
            "mt-1 block px-1 text-xs opacity-50",
            animation !== "none" && "duration-500 animate-in fade-in-0"
          )}
        >
          {formattedTime}
          {!isUser && completionTime !== undefined && completionTime >= 1 && (
            <> • {completionTime}s</>
          )}
          {!isUser && aborted && (
            <> • <span className="text-orange-600 dark:text-orange-400">Cancelled</span></>
          )}
        </time>
      ) : null}
    </div>
  );
};

function dataUrlToUint8Array(data: string) {
  const base64 = data.split(",")[1];
  const buf = Buffer.from(base64, "base64");
  return new Uint8Array(buf);
}

const ReasoningBlock = ({ part }: { part: ReasoningPart }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2 flex flex-col items-start sm:max-w-[70%]">
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="group w-full overflow-hidden rounded-lg border bg-muted/50"
      >
        <div className="flex items-center p-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
              <span>Thinking</span>
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent forceMount>
          <motion.div
            initial={false}
            animate={isOpen ? "open" : "closed"}
            variants={{
              open: { height: "auto", opacity: 1 },
              closed: { height: 0, opacity: 0 },
            }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="border-t"
          >
            <div className="p-2">
              <div className="whitespace-pre-wrap text-xs">
                {part.reasoning}
              </div>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

function ToolCall({
  toolInvocations,
}: Pick<ChatMessageProps, "toolInvocations">) {
  if (!toolInvocations?.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {toolInvocations.map((invocation, index) => {
        // Check for cancelled state - handle both formats
        const isCancelled =
          invocation.state === "result" &&
          invocation.result?.__cancelled === true;

        if (isCancelled) {
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded border border-muted-foreground/20 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              <Ban className="h-3 w-3" />
              <span>
                Cancelled{" "}
                <code className="font-mono">{invocation.toolName}</code>
              </span>
            </div>
          );
        }

        switch (invocation.state) {
          case "partial-call":
          case "call":
            return (
              <div
                key={index}
                className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-blue-950/30 dark:text-blue-400"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="font-mono text-xs">
                  <span className="capitalize">{invocation.toolName}</span>{" "}
                  <span className="capitalize">
                    {invocation.args?.action || "tool"}
                  </span>
                </span>
              </div>
            );
          case "result":
            return (
              <div
                key={index}
                className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50/50 px-2.5 py-1.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
              >
                <Code2 className="h-3 w-3" />
                <span className="font-mono text-xs">
                  <span className="capitalize">{invocation.toolName}</span>{" "}
                  <span className="capitalize">
                    {invocation.args?.action || "tool"}
                  </span>
                </span>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
