"use client";

import { ArrowDown, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { forwardRef, useCallback, useRef, type ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "@/components/ui/button";
import { type Message } from "../messages";
import { CopyButton } from "@/components/ui/copy-button";
import { MessageInput } from "@/components/ui/message-input";
import { MessageList } from "@/components/ui/message-list";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useFileStore } from "@/stores/file-store";
import { cn } from "@/lib/utils";
import { GlobalToolDialogs, type ToolInvocation } from "../tools";

interface ChatProps {
  handleSubmit: (
    event?: { preventDefault?: () => void },
    options?: { experimental_attachments?: FileList }
  ) => void;
  messages: Array<Message>;
  input: string;
  className?: string;
  handleInputChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  isGenerating: boolean;
  isHistoryLoading?: boolean;
  stop?: () => void;
  onRateResponse?: (
    messageId: string,
    rating: "thumbs-up" | "thumbs-down"
  ) => void;
  setMessages?: (messages: any[]) => void;
  transcribeAudio?: (blob: Blob) => Promise<string>;
  welcomeMessage?: string | null;
}

export function Chat({
  messages,
  handleSubmit,
  input,
  handleInputChange,
  stop,
  isGenerating,
  isHistoryLoading = false,
  className,
  onRateResponse,
  setMessages,
  transcribeAudio,
  welcomeMessage,
}: ChatProps) {
  const isEmpty = messages.length === 0;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleStop = useCallback(() => {
    stop?.();
    if (!setMessages) return;

    const latestMessages = [...messagesRef.current];
    const lastAssistantMessage = latestMessages.findLast((m) => m.role === "assistant");
    if (!lastAssistantMessage) return;

    let needsUpdate = false;
    let updatedMessage = { ...lastAssistantMessage };

    if (lastAssistantMessage.toolInvocations) {
      const updatedToolInvocations = lastAssistantMessage.toolInvocations.map((toolInvocation) => {
        if (toolInvocation.state === "call") {
          needsUpdate = true;
          return {
            ...toolInvocation,
            state: "result",
            result: { content: "Tool execution was cancelled", __cancelled: true },
          } as const;
        }
        return toolInvocation;
      });
      if (needsUpdate) updatedMessage = { ...updatedMessage, toolInvocations: updatedToolInvocations };
    }

    if (lastAssistantMessage.parts) {
      const updatedParts = lastAssistantMessage.parts.map((part) => {
        if (part.type === "tool-invocation" && part.toolInvocation?.state === "call") {
          needsUpdate = true;
          return {
            ...part,
            toolInvocation: { ...part.toolInvocation, state: "result" as const, result: { content: "Tool execution was cancelled", __cancelled: true } },
          };
        }
        return part;
      });
      if (needsUpdate) updatedMessage = { ...updatedMessage, parts: updatedParts };
    }

    if (needsUpdate) {
      const messageIndex = latestMessages.findIndex((m) => m.id === lastAssistantMessage.id);
      if (messageIndex !== -1) {
        latestMessages[messageIndex] = updatedMessage;
        setMessages(latestMessages);
      }
    }
  }, [stop, setMessages]);

  const messageOptions = useCallback(
    (message: Message) => ({
      actions: onRateResponse ? (
        <>
          <div className="border-r pr-1">
            <CopyButton content={message.content} copyMessage="Copied response to clipboard!" />
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRateResponse(message.id, "thumbs-up")}>
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRateResponse(message.id, "thumbs-down")}>
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <CopyButton content={message.content} copyMessage="Copied response to clipboard!" />
      ),
    }),
    [onRateResponse]
  );

  const allToolInvocations: ToolInvocation[] = [];
  messages.forEach((message) => {
    if (message.toolInvocations) allToolInvocations.push(...message.toolInvocations);
    if (message.parts) {
      message.parts.forEach((part) => {
        if (part.type === "tool-invocation" && part.toolInvocation) {
          allToolInvocations.push(part.toolInvocation);
        }
      });
    }
  });

  const {
    containerRef,
    scrollToBottom,
    handleScroll,
    shouldAutoScroll,
    handleTouchStart,
  } = useAutoScroll([messages]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <GlobalToolDialogs toolInvocations={allToolInvocations} />

      {/* Messages - flex-1 with overflow */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        {isEmpty ? (
          <div className="h-full flex items-center justify-center px-4">
            {isHistoryLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading conversation...</p>
              </div>
            ) : (
              welcomeMessage || "Welcome"
            )}
          </div>
        ) : (
          <div className="max-w-[650px] mx-auto px-4 py-4">
            <MessageList messages={messages} messageOptions={messageOptions} />
          </div>
        )}

        {/* Scroll to bottom button */}
        {!isEmpty && !shouldAutoScroll && (
          <div className="sticky bottom-4 flex justify-end px-4 pointer-events-none">
            <Button
              onClick={scrollToBottom}
              className="pointer-events-auto h-8 w-8 rounded-full shadow-md"
              size="icon"
              variant="secondary"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Input area - fixed height */}
      <div className="h-16 md:h-20 border-t bg-background px-3 md:px-0">
        <ChatForm
          className="h-full max-w-[650px] mx-auto flex items-center"
          handleSubmit={handleSubmit}
        >
          {({ files, setFiles }) => (
            <MessageInput
              value={input}
              onChange={handleInputChange}
              allowAttachments
              files={files}
              setFiles={setFiles}
              stop={handleStop}
              isGenerating={isGenerating}
              transcribeAudio={transcribeAudio}
              className="h-10 md:h-12"
            />
          )}
        </ChatForm>
      </div>
    </div>
  );
}

interface ChatFormProps {
  className?: string;
  handleSubmit: (event?: { preventDefault?: () => void }, options?: { experimental_attachments?: FileList }) => void;
  children: (props: { files: File[] | null; setFiles: React.Dispatch<React.SetStateAction<File[] | null>> }) => ReactElement;
}

const ChatForm = forwardRef<HTMLFormElement, ChatFormProps>(
  ({ children, handleSubmit, className }, ref) => {
    const { files, setFiles, clearFiles } = useFileStore(
      useShallow((state) => ({ files: state.files, setFiles: state.setFiles, clearFiles: state.clearFiles }))
    );

    const onSubmit = (event: React.FormEvent) => {
      if (!files) {
        handleSubmit(event);
        return;
      }
      const fileList = createFileList(files);
      handleSubmit(event, { experimental_attachments: fileList });
      clearFiles();
    };

    return (
      <form ref={ref} onSubmit={onSubmit} className={className}>
        {children({ files, setFiles })}
      </form>
    );
  }
);
ChatForm.displayName = "ChatForm";

function createFileList(files: File[] | FileList): FileList {
  const dataTransfer = new DataTransfer();
  for (const file of Array.from(files)) {
    dataTransfer.items.add(file);
  }
  return dataTransfer.files;
}
