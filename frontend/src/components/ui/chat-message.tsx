import React, { useMemo, useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { Ban, ChevronRight, Code2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FilePreview } from "@/components/ui/file-preview";
import { FileAttachmentList } from "@/components/ui/file-attachment";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { ScriptDetailsDialog } from "@/components/ui/script-details-dialog";
import { FileToolDetailsDialog } from "@/components/ui/file-tool-details-dialog";
import { useUIStore } from "@/stores/ui-store";

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
  toolCallId?: string;
}

interface ToolCall {
  state: "call";
  toolName: string;
  args?: Record<string, any>;
  toolCallId?: string;
}

interface ToolExecuting {
  state: "executing";
  toolName: string;
  args?: Record<string, any>;
  result?: {
    purpose?: string;
    code?: string;
    [key: string]: any;
  };
  toolCallId?: string;
}

interface ToolProgress {
  state: "progress";
  toolName: string;
  args?: Record<string, any>;
  result?: {
    message?: string;
    [key: string]: any;
  };
  toolCallId?: string;
}

interface ToolResult {
  state: "result";
  toolName: string;
  result: {
    __cancelled?: boolean;
    [key: string]: any;
  };
  args?: Record<string, any>;
  toolCallId?: string;
}

interface ToolError {
  state: "error";
  toolName: string;
  args?: Record<string, any>;
  error?: string;
  result?: any;
  toolCallId?: string;
}

type ToolInvocation =
  | PartialToolCall
  | ToolCall
  | ToolExecuting
  | ToolProgress
  | ToolResult
  | ToolError;

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

export interface UploadedFileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
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
  completionTime?: number; // Time in seconds to complete the message
  isThinking?: boolean; // Temporary thinking indicator
  aborted?: boolean; // Message was aborted/cancelled
}

export interface ChatMessageProps extends Omit<
  Message,
  "completionTime" | "isThinking" | "aborted"
> {
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
  attachments,
  toolInvocations,
  parts,
  completionTime,
  isThinking,
  aborted,
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
      createdAt: !!createdAt,
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
        {/* Show experimental_attachments (old format) */}
        {files ? (
          <div className="mb-1 flex flex-wrap gap-2">
            {files.map((file, index) => {
              return <FilePreview file={file} key={index} />;
            })}
          </div>
        ) : null}

        {/* Show uploaded file attachments (new format) */}
        {attachments && attachments.length > 0 && (
          <FileAttachmentList files={attachments} className="mb-2" />
        )}

        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>

        {showTimeStamp && createdAt ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "t1",
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
    // Group adjacent memory and file tool invocations in parts
    const groupedParts: Array<MessagePart | MessagePart[]> = [];
    let currentMemoryParts: ToolInvocationPart[] = [];
    let currentFileParts: ToolInvocationPart[] = [];

    parts.forEach((part) => {
      if (
        part.type === "tool-invocation" &&
        part.toolInvocation.toolName === "memory"
      ) {
        // Flush file parts if any
        if (currentFileParts.length > 0) {
          groupedParts.push(
            currentFileParts.length === 1
              ? currentFileParts[0]
              : currentFileParts
          );
          currentFileParts = [];
        }
        currentMemoryParts.push(part as ToolInvocationPart);
      } else if (
        part.type === "tool-invocation" &&
        part.toolInvocation.toolName === "file"
      ) {
        // Flush memory parts if any
        if (currentMemoryParts.length > 0) {
          groupedParts.push(
            currentMemoryParts.length === 1
              ? currentMemoryParts[0]
              : currentMemoryParts
          );
          currentMemoryParts = [];
        }
        currentFileParts.push(part as ToolInvocationPart);
      } else {
        // If we have accumulated memory parts, push them as a group
        if (currentMemoryParts.length > 0) {
          groupedParts.push(
            currentMemoryParts.length === 1
              ? currentMemoryParts[0]
              : currentMemoryParts
          );
          currentMemoryParts = [];
        }
        // If we have accumulated file parts, push them as a group
        if (currentFileParts.length > 0) {
          groupedParts.push(
            currentFileParts.length === 1
              ? currentFileParts[0]
              : currentFileParts
          );
          currentFileParts = [];
        }
        // Push the other part
        groupedParts.push(part);
      }
    });

    // Don't forget to push any remaining groups
    if (currentMemoryParts.length > 0) {
      groupedParts.push(
        currentMemoryParts.length === 1
          ? currentMemoryParts[0]
          : currentMemoryParts
      );
    }
    if (currentFileParts.length > 0) {
      groupedParts.push(
        currentFileParts.length === 1 ? currentFileParts[0] : currentFileParts
      );
    }

    return groupedParts.map((partOrGroup, index) => {
      // Handle tool groups (memory or file)

      if (Array.isArray(partOrGroup)) {
        const invocations = partOrGroup.map((p) => {
          if (p.type === "tool-invocation") {
            return p.toolInvocation;
          }
          throw new Error("Invalid part in tool group");
        });

        // Check what type of tool group this is
        const toolName = invocations[0]?.toolName;
        if (toolName === "memory") {
          return (
            <MemoryToolGroup
              key={`memory-group-${index}`}
              invocations={invocations}
            />
          );
        } else if (toolName === "file") {
          return (
            <FileToolGroup
              key={`file-group-${index}`}
              invocations={invocations}
            />
          );
        }
        // Unknown tool group type, skip
        return null;
      }

      const part = partOrGroup;

      if (part.type === "text") {
        if (!part.text.trim()) return null;
        return (
          <div
            className={cn(
              "flex flex-col",
              isUser ? "items-end" : "items-start"
            )}
            key={`text-${index}`}
          >
            <div
              className={cn("mo", chatBubbleVariants({ isUser, animation }))}
            >
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
                  "t2",
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

  // Split content at first meaningful newline (skip leading newlines) if we have tool invocations
  const shouldSplitContent =
    !isUser && toolInvocations && toolInvocations.length > 0;
  let beforeToolContent = "";
  let afterToolContent = content;

  if (shouldSplitContent) {
    // During streaming, content might not have newlines yet
    // Always put initial content before tools to maintain order
    if (content.includes("\n")) {
      // Trim leading whitespace to find the actual content start
      const trimmedContent = content.trimStart();
      const firstNewline = trimmedContent.indexOf("\n");

      if (firstNewline !== -1) {
        // Find where the first paragraph ends (double newline or single newline followed by content)
        const doubleNewline = trimmedContent.indexOf("\n\n");

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
    } else if (content.trim()) {
      // No newline yet (streaming), put all content before tools
      beforeToolContent = content.trim();
      afterToolContent = "";
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
      {((shouldSplitContent && afterToolContent && afterToolContent.trim()) ||
        (!shouldSplitContent && content && content.trim())) && (
        <div className={cn("me", chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>
            {shouldSplitContent ? afterToolContent : content}
          </MarkdownRenderer>
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
            "t3",
            "mt-1 block px-1 text-xs opacity-50",
            animation !== "none" && "duration-500 animate-in fade-in-0"
          )}
        >
          {formattedTime}
          {!isUser && completionTime !== undefined && completionTime >= 1 && (
            <> • {completionTime}s</>
          )}
          {!isUser && aborted && (
            <>
              {" "}
              •{" "}
              <span className="text-orange-600 dark:text-orange-400">
                Cancelled
              </span>
            </>
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

function MemoryToolGroup({ invocations }: { invocations: ToolInvocation[] }) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine the overall state of the group based on the latest state
  const latestState = invocations[invocations.length - 1]?.state || "call";
  const hasError = invocations.some((inv) => inv.state === "error");

  // Get color classes based on state
  const getGroupColorClasses = () => {
    if (hasError) {
      return "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30";
    }
    switch (latestState) {
      case "partial-call":
      case "call":
        return "border-blue-200 bg-blue-50/50 dark:border-slate-800 dark:bg-blue-950/30";
      case "executing":
        return "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30";
      case "progress":
        return "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30";
      case "result":
        return "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30";
      default:
        return "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30";
    }
  };

  const getIconColorClasses = () => {
    if (hasError) {
      return "text-red-700 dark:text-red-400";
    }
    switch (latestState) {
      case "partial-call":
      case "call":
        return "text-slate-700 dark:text-blue-400";
      case "executing":
        return "text-purple-700 dark:text-purple-400";
      case "progress":
        return "text-amber-700 dark:text-amber-400";
      case "result":
        return "text-green-700 dark:text-green-400";
      default:
        return "text-slate-700 dark:text-slate-400";
    }
  };

  const getMemoryActionLabel = (inv: ToolInvocation) => {
    const action = inv.args?.action || "operation";
    const category = inv.args?.category;
    const key = inv.args?.key;

    if (category && key) {
      return `${action} ${category}.${key}`;
    } else if (category) {
      return `${action} ${category}`;
    }
    return action;
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "group w-full rounded-xl border px-2.5 py-1.5 cursor-pointer hover:opacity-80 transition-opacity",
        getGroupColorClasses()
      )}
    >
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 text-xs w-full">
          {latestState === "call" ||
          latestState === "partial-call" ||
          latestState === "executing" ||
          latestState === "progress" ? (
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          ) : hasError ? (
            <Ban className="h-3 w-3 shrink-0" />
          ) : (
            <Code2 className="h-3 w-3 shrink-0" />
          )}
          <span className={cn("font-mono flex-1", getIconColorClasses())}>
            Memory ({invocations.length}{" "}
            {invocations.length === 1 ? "operation" : "operations"})
          </span>
          <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90 shrink-0" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-5 space-y-1">
          {invocations.map((inv, idx) => (
            <div
              key={idx}
              className={cn(
                "text-xs py-0.5",
                inv.state === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-600 dark:text-slate-400"
              )}
            >
              <span className="font-mono">{getMemoryActionLabel(inv)}</span>
              {inv.state === "error" && inv.error && (
                <div className="text-[10px] ml-2 text-red-500 dark:text-red-400">
                  {inv.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FileToolGroup({ invocations }: { invocations: ToolInvocation[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const { setSelectedFileTool } = useUIStore();

  // Determine the overall state of the group based on the latest state
  const latestState = invocations[invocations.length - 1]?.state || "call";
  const hasError = invocations.some((inv) => inv.state === "error");

  // Get color classes based on state
  const getGroupColorClasses = () => {
    if (hasError) {
      return "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30";
    }
    switch (latestState) {
      case "partial-call":
      case "call":
        return "border-blue-200 bg-blue-50/50 dark:border-slate-800 dark:bg-blue-950/30";
      case "executing":
        return "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30";
      case "progress":
        return "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30";
      case "result":
        return "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30";
      default:
        return "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30";
    }
  };

  const getIconColorClasses = () => {
    if (hasError) {
      return "text-red-700 dark:text-red-400";
    }
    switch (latestState) {
      case "partial-call":
      case "call":
        return "text-slate-700 dark:text-blue-400";
      case "executing":
        return "text-purple-700 dark:text-purple-400";
      case "progress":
        return "text-amber-700 dark:text-amber-400";
      case "result":
        return "text-green-700 dark:text-green-400";
      default:
        return "text-slate-700 dark:text-slate-400";
    }
  };

  const getFileActionLabel = (inv: ToolInvocation) => {
    const action = inv.args?.action || "operation";
    const path = inv.args?.path;

    if (path) {
      return `${action} ${path}`;
    }
    return action;
  };

  const handleFileClick = (inv: ToolInvocation) => {
    if (inv.args?.action) {
      setSelectedFileTool({
        action: inv.args.action,
        path: inv.args.path,
        newPath: inv.args.newPath,
        state: inv.state === "partial-call" ? "call" : inv.state,
        result: "result" in inv ? inv.result : undefined,
        error: "error" in inv ? inv.error : undefined,
      });
    }
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "group w-full rounded-xl border px-2.5 py-1.5 cursor-pointer hover:opacity-80 transition-opacity",
        getGroupColorClasses()
      )}
    >
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 text-xs w-full">
          {latestState === "call" ||
          latestState === "partial-call" ||
          latestState === "executing" ||
          latestState === "progress" ? (
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          ) : hasError ? (
            <Ban className="h-3 w-3 shrink-0" />
          ) : (
            <Code2 className="h-3 w-3 shrink-0" />
          )}
          <span className={cn("font-mono flex-1", getIconColorClasses())}>
            File ({invocations.length}{" "}
            {invocations.length === 1 ? "operation" : "operations"})
          </span>
          <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90 shrink-0" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-5 space-y-1">
          {invocations.map((inv, idx) => (
            <div
              key={idx}
              className={cn(
                "text-xs py-0.5 cursor-pointer hover:underline",
                inv.state === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-600 dark:text-slate-400"
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleFileClick(inv);
              }}
            >
              <span className="font-mono">{getFileActionLabel(inv)}</span>
              {inv.state === "error" && inv.error && (
                <div className="text-[10px] ml-2 text-red-500 dark:text-red-400">
                  {inv.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolCall({
  toolInvocations,
}: Pick<ChatMessageProps, "toolInvocations">) {
  const {
    selectedScript,
    selectedFileTool,
    setSelectedScript,
    setSelectedFileTool,
  } = useUIStore();

  if (!toolInvocations?.length) return null;

  // Collect all progress messages for script tools
  const scriptProgressMap = new Map<string, string[]>();
  toolInvocations.forEach((inv) => {
    if (
      inv.toolName === "script" &&
      inv.state === "progress" &&
      "result" in inv &&
      inv.result?.message
    ) {
      const key = inv.toolCallId || inv.args?.purpose || "script";
      if (!scriptProgressMap.has(key)) {
        scriptProgressMap.set(key, []);
      }
      scriptProgressMap.get(key)!.push(inv.result.message);
    }
  });

  // Group adjacent memory and file tool calls
  const groupedInvocations: Array<ToolInvocation | ToolInvocation[]> = [];
  let currentMemoryGroup: ToolInvocation[] = [];
  let currentFileGroup: ToolInvocation[] = [];

  toolInvocations.forEach((invocation) => {
    if (invocation.toolName === "memory") {
      // Flush file group if any
      if (currentFileGroup.length > 0) {
        groupedInvocations.push(
          currentFileGroup.length === 1 ? currentFileGroup[0] : currentFileGroup
        );
        currentFileGroup = [];
      }
      currentMemoryGroup.push(invocation);
    } else if (invocation.toolName === "file") {
      // Flush memory group if any
      if (currentMemoryGroup.length > 0) {
        groupedInvocations.push(
          currentMemoryGroup.length === 1
            ? currentMemoryGroup[0]
            : currentMemoryGroup
        );
        currentMemoryGroup = [];
      }
      currentFileGroup.push(invocation);
    } else {
      // If we have accumulated memory tools, push them as a group
      if (currentMemoryGroup.length > 0) {
        groupedInvocations.push(
          currentMemoryGroup.length === 1
            ? currentMemoryGroup[0]
            : currentMemoryGroup
        );
        currentMemoryGroup = [];
      }
      // If we have accumulated file tools, push them as a group
      if (currentFileGroup.length > 0) {
        groupedInvocations.push(
          currentFileGroup.length === 1 ? currentFileGroup[0] : currentFileGroup
        );
        currentFileGroup = [];
      }
      // Push the other tool
      groupedInvocations.push(invocation);
    }
  });

  // Don't forget to push any remaining groups
  if (currentMemoryGroup.length > 0) {
    groupedInvocations.push(
      currentMemoryGroup.length === 1
        ? currentMemoryGroup[0]
        : currentMemoryGroup
    );
  }
  if (currentFileGroup.length > 0) {
    groupedInvocations.push(
      currentFileGroup.length === 1 ? currentFileGroup[0] : currentFileGroup
    );
  }

  return (
    <>
      <ScriptDetailsDialog
        open={!!selectedScript}
        onOpenChange={(open) => !open && setSelectedScript(null)}
        purpose={selectedScript?.purpose || ""}
        code={selectedScript?.code || ""}
        state={selectedScript?.state || "call"}
        progressMessages={
          selectedScript
            ? scriptProgressMap.get(selectedScript.purpose) || []
            : []
        }
        result={selectedScript?.result}
        error={selectedScript?.error}
      />
      <FileToolDetailsDialog
        open={!!selectedFileTool}
        onOpenChange={(open) => !open && setSelectedFileTool(null)}
        action={selectedFileTool?.action || ""}
        path={selectedFileTool?.path}
        newPath={selectedFileTool?.newPath}
        state={selectedFileTool?.state || "call"}
        result={selectedFileTool?.result}
        error={selectedFileTool?.error}
      />
      <div className="flex flex-col gap-1.5 items-start">
        {groupedInvocations.map((invocationOrGroup, index) => {
          // Handle tool groups (memory or file)
          if (Array.isArray(invocationOrGroup)) {
            const toolName = invocationOrGroup[0]?.toolName;
            if (toolName === "memory") {
              return (
                <MemoryToolGroup
                  key={`memory-group-${index}`}
                  invocations={invocationOrGroup}
                />
              );
            } else if (toolName === "file") {
              return (
                <FileToolGroup
                  key={`file-group-${index}`}
                  invocations={invocationOrGroup}
                />
              );
            }
            // Unknown tool group type, skip
            return null;
          }

          const invocation = invocationOrGroup;
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

          const isScript = invocation.toolName === "script";
          const isFileTool = invocation.toolName === "file";

          const handleScriptClick = () => {
            if (isScript) {
              // For executing state, code might be in result field
              const code =
                invocation.args?.code ||
                (invocation.state === "executing" && invocation.result?.code) ||
                "";
              const purpose =
                invocation.args?.purpose ||
                (invocation.state === "executing" &&
                  invocation.result?.purpose) ||
                "Script execution";

              if (code) {
                // Extract the actual result from the wrapped response
                let actualResult = undefined;
                if ("result" in invocation && invocation.result) {
                  // For completed scripts, result is wrapped as { purpose, result }
                  // Extract the nested result if it exists, otherwise use the whole result
                  actualResult =
                    invocation.result.result !== undefined
                      ? invocation.result.result
                      : invocation.result;
                }

                // Debug logging
                console.log("[Dialog Open] Script invocation data:", {
                  toolCallId: invocation.toolCallId,
                  state: invocation.state,
                  hasResultKey: "result" in invocation,
                  invocationResult:
                    "result" in invocation ? invocation.result : undefined,
                  invocationResultType:
                    "result" in invocation
                      ? typeof invocation.result
                      : "undefined",
                  extractedResult: actualResult,
                  extractedResultType: typeof actualResult,
                  fullInvocation: invocation,
                });

                setSelectedScript({
                  purpose,
                  code,
                  state:
                    invocation.state === "partial-call"
                      ? "call"
                      : invocation.state,
                  result: actualResult,
                  error: "error" in invocation ? invocation.error : undefined,
                });
              }
            }
          };

          const handleFileToolClick = () => {
            if (isFileTool && invocation.args?.action) {
              setSelectedFileTool({
                action: invocation.args.action,
                path: invocation.args.path,
                newPath: invocation.args.newPath,
                state:
                  invocation.state === "partial-call"
                    ? "call"
                    : invocation.state,
                result: "result" in invocation ? invocation.result : undefined,
                error: "error" in invocation ? invocation.error : undefined,
              });
            }
          };

          if (invocation.toolName === "todo") return <></>;

          let toolName = (
            <span className="font-mono text-xs">
              {invocation.toolName !== "script" && (
                <span className="capitalize">{invocation.toolName}:</span>
              )}
              {invocation.toolName === "script" && invocation.args?.purpose ? (
                <span className="">{invocation.args.purpose}</span>
              ) : (
                <>
                  {invocation.args?.action
                    .split("_")
                    .map((e: string, i: number) => {
                      return (
                        <span className="capitalize ml-1" key={i}>
                          {e}
                        </span>
                      );
                    }) || "tool"}
                </>
              )}
            </span>
          );

          switch (invocation.state) {
            case "partial-call":
            case "call":
              return (
                <div
                  key={index}
                  onClick={
                    isScript
                      ? handleScriptClick
                      : isFileTool
                        ? handleFileToolClick
                        : undefined
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-blue-950/30 dark:text-blue-400",
                    (isScript || isFileTool) &&
                      "cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/40"
                  )}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {toolName}
                </div>
              );
            case "executing":
              return (
                <div
                  key={index}
                  onClick={isScript ? handleScriptClick : undefined}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border border-purple-200 bg-purple-50/50 px-3 py-2 text-xs dark:border-purple-800 dark:bg-purple-950/30",
                    isScript &&
                      "cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {toolName}
                  </div>
                  {invocation.result?.code && (
                    <div className="ml-6 text-purple-600/70 dark:text-purple-400/70 font-mono text-xs line-clamp-2">
                      {invocation.result.code.substring(0, 100)}
                      {invocation.result.code.length > 100 && "..."}
                    </div>
                  )}
                </div>
              );
            case "progress":
              return (
                <div
                  key={index}
                  onClick={
                    isScript
                      ? handleScriptClick
                      : isFileTool
                        ? handleFileToolClick
                        : undefined
                  }
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-xs dark:border-amber-800 dark:bg-amber-950/30",
                    (isScript || isFileTool) &&
                      "cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {toolName}
                  </div>
                  {invocation.result?.message && (
                    <div className="text-amber-600 dark:text-amber-500 ml-5">
                      {invocation.result.message}
                    </div>
                  )}
                </div>
              );
            case "result":
              return (
                <div
                  key={index}
                  onClick={
                    isScript
                      ? handleScriptClick
                      : isFileTool
                        ? handleFileToolClick
                        : undefined
                  }
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-green-200 bg-green-50/50 px-2.5 py-1.5 text-xs dark:border-green-800 dark:bg-green-950/30",
                    (isScript || isFileTool) &&
                      "cursor-pointer hover:bg-green-100/50 dark:hover:bg-green-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <Code2 className="h-3 w-3" />
                    {toolName}
                  </div>
                </div>
              );
            case "error":
              return (
                <div
                  key={index}
                  onClick={
                    isScript
                      ? handleScriptClick
                      : isFileTool
                        ? handleFileToolClick
                        : undefined
                  }
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-red-200 bg-red-50/50 px-2.5 py-1.5 text-xs dark:border-red-800 dark:bg-red-950/30",
                    (isScript || isFileTool) &&
                      "cursor-pointer hover:bg-red-100/50 dark:hover:bg-red-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <Ban className="h-3 w-3" />
                    {toolName}
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </>
  );
}
