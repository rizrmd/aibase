import { useMemo } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { FilePreview } from "@/components/ui/file-preview";
import { FileAttachmentList } from "@/components/ui/file-attachment";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { chatBubbleVariants } from "../shared/variants";
import { dataUrlToUint8Array } from "../shared/utils";
import { ReasoningBlock } from "./reasoning-block";
import { ToolCall, MemoryToolGroup, FileToolGroup } from "../tools";
import type {
  ChatMessageProps,
  MessagePart,
  ToolInvocationPart,
} from "./types";

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
