import { useCallback, useRef } from "react";
import type { Message } from "@/components/ui/chat";
import type { WSClient } from "@/lib/ws/ws-connection-manager";
import { uploadFilesWithProgress } from "@/lib/file-upload";
import { createNewChat } from "@/lib/embed-api";

interface UseMessageSubmissionProps {
  wsClient: WSClient | null;
  projectId: string | undefined;
  input: string;
  setInput: (input: string) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTodos: (todos: any) => void;
  setUploadProgress: (progress: number | null) => void; // Kept for backwards compatibility
  isLoading: boolean;
  thinkingStartTimeRef: React.MutableRefObject<number | null>;
  currentMessageRef: React.MutableRefObject<string | null>;
  currentMessageIdRef: React.MutableRefObject<string | null>;
  currentToolInvocationsRef: React.MutableRefObject<Map<string, any>>;
  currentPartsRef: React.MutableRefObject<any[]>;
  generateNewConvId: () => string;
  isEmbedMode?: boolean;
  updateMessage: (id: string, updates: Partial<Message>) => void; // For updating upload progress
}

export function useMessageSubmission({
  wsClient,
  projectId,
  input,
  setInput,
  setMessages,
  setIsLoading,
  setError,
  setTodos,
  setUploadProgress,
  isLoading,
  thinkingStartTimeRef,
  currentMessageRef,
  currentMessageIdRef,
  currentToolInvocationsRef,
  currentPartsRef,
  generateNewConvId,
  isEmbedMode = false,
  updateMessage,
}: UseMessageSubmissionProps) {
  // Track if we're currently submitting to prevent double submissions
  const isSubmittingRef = useRef(false);
  // Track last submit time to prevent rapid duplicate submissions
  const lastSubmitTimeRef = useRef<number>(0);

  const handleSubmit = useCallback(
    async (
      e?: { preventDefault?: () => void },
      options?: { experimental_attachments?: FileList }
    ) => {
      e?.preventDefault?.();

      // Prevent rapid duplicate submissions (within 100ms)
      const now = Date.now();
      if (now - lastSubmitTimeRef.current < 100) {
        console.log("[Submit] Ignoring rapid duplicate submission");
        return;
      }
      lastSubmitTimeRef.current = now;

      const isConnected = wsClient?.isConnected() === true;

      console.log(
        "[Submit] Called with input:",
        input?.substring(0, 50),
        "isConnected:",
        isConnected,
        "attachments:",
        options?.experimental_attachments?.length || 0
      );

      const hasAttachments = options?.experimental_attachments && options.experimental_attachments.length > 0;

      // Allow submission if there's input text OR if there are attachments
      if ((!input.trim() && !hasAttachments) || !isConnected) {
        console.log("[Submit] Skipping - no input/attachments or not connected");
        return;
      }

      // Prevent double submissions
      if (isSubmittingRef.current) {
        console.log(
          "[Submit] Already submitting, ignoring duplicate submission"
        );
        return;
      }

      // Mark as submitting
      isSubmittingRef.current = true;
      console.log("[Submit] Marked as submitting");

      // If already loading, abort the previous request first
      if (isLoading) {
        console.log(
          "[Submit] Aborting previous request before sending new message"
        );

        // Clear thinking start time
        thinkingStartTimeRef.current = null;
        // Clear tool invocations
        currentToolInvocationsRef.current.clear();
        // Save the aborted message ID
        const abortedMessageId = currentMessageIdRef.current;
        // Clear current message refs
        currentMessageRef.current = null;
        currentMessageIdRef.current = null;
        // Reset loading state to allow new submission
        setIsLoading(false);

        // Mark message as aborted and remove thinking indicator
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isThinking);
          if (abortedMessageId) {
            return filtered.map((m) =>
              m.id === abortedMessageId ? { ...m, aborted: true } : m
            );
          }
          return filtered;
        });

        // Send abort to backend
        wsClient.abort();

        // Wait longer for abort to fully process on backend before sending new message
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Store the message text and clear input immediately for better UX
      const messageText = input.trim();
      setInput("");
      setError(null);

      try {
        let uploadedFiles: any[] | undefined = undefined;

        // Upload files FIRST if any are attached
        let uploadProgressMessageId: string | null = null;

        if (options?.experimental_attachments && options.experimental_attachments.length > 0) {
          console.log("[Submit] Uploading", options.experimental_attachments.length, "files");

          // Create upload progress message
          uploadProgressMessageId = `upload_progress_${Date.now()}`;
          setMessages((prev) => [...prev, {
            id: uploadProgressMessageId!,
            role: "user",
            content: "Uploading files...",
            createdAt: new Date(),
            uploadProgress: 0,
          }]);

          try {
            const filesArray = Array.from(options.experimental_attachments);

            if (!projectId) {
              throw new Error("Project ID is required for file uploads");
            }

            uploadedFiles = await uploadFilesWithProgress(filesArray, {
              projectId,
              onProgress: (progress) => {
                console.log("[Upload Progress]", progress.percentage + "%");
                // Update the upload progress message
                if (uploadProgressMessageId) {
                  updateMessage(uploadProgressMessageId, {
                    content: `Uploading files... ${progress.percentage}%`,
                    uploadProgress: progress.percentage,
                  });
                }
              }
            });

            console.log("[Submit] Files uploaded successfully:", uploadedFiles);

            // Remove the upload progress message
            setMessages((prev) => prev.filter((m) => m.id !== uploadProgressMessageId));
          } catch (uploadError) {
            console.error("[Submit] File upload failed:", uploadError);

            // Update the progress message to show error
            if (uploadProgressMessageId) {
              updateMessage(uploadProgressMessageId, {
                content: "Upload failed",
                uploadProgress: undefined,
              });
            }

            setError(uploadError instanceof Error ? uploadError.message : "File upload failed");
            // Restore the input since upload failed
            setInput(messageText);
            // Don't proceed if upload failed
            return;
          }
        }

        // Create user message AFTER successful upload with file metadata
        const userMessage: Message = {
          id: `msg_${Date.now()}_user`,
          role: "user",
          content: messageText,
          createdAt: new Date(),
          ...(uploadedFiles && uploadedFiles.length > 0 && { attachments: uploadedFiles }),
        };

        const thinkingMessage: Message = {
          id: `thinking_${Date.now()}`,
          role: "assistant",
          content: "Thinking...",
          createdAt: new Date(),
          isThinking: true,
        };

        // Set thinking start time for interval updates
        thinkingStartTimeRef.current = Date.now();

        // Add messages to UI
        setMessages((prev) => [...prev, userMessage, thinkingMessage]);
        setIsLoading(true);

        console.log(
          "[Submit] Sending message to backend:",
          messageText.substring(0, 50)
        );

        // Send message with file IDs to backend so AI can read them
        await wsClient.sendMessage(messageText, {
          fileIds: uploadedFiles?.map(f => f.id)
        });
        console.log("[Submit] Message sent successfully");
      } catch (error) {
        console.log("[Submit] Error sending message:", error);
        setIsLoading(false);
        setError(
          error instanceof Error ? error.message : "Failed to send message"
        );

        // Remove the last two messages (user message and thinking indicator) if send failed
        setMessages((prev) => prev.slice(0, -2));
      } finally {
        // Reset submitting flag after a short delay to allow state updates to complete
        setTimeout(() => {
          console.log("[Submit] Clearing submitting flag");
          isSubmittingRef.current = false;
        }, 100);
      }
    },
    [
      input,
      wsClient,
      isLoading,
      setInput,
      setError,
      setIsLoading,
      setMessages,
      setUploadProgress,
      thinkingStartTimeRef,
      currentMessageRef,
      currentMessageIdRef,
      currentToolInvocationsRef,
      updateMessage,
      projectId,
    ]
  );

  const abort = useCallback(() => {
    console.log("[Abort] User manually aborted request");
    setIsLoading(false);
    const abortedMessageId = currentMessageIdRef.current;
    currentMessageRef.current = null;
    currentMessageIdRef.current = null;
    // Clear thinking start time
    thinkingStartTimeRef.current = null;
    // Clear tool invocations
    currentToolInvocationsRef.current.clear();
    // Clear submitting flag to allow new messages
    isSubmittingRef.current = false;
    // Mark the current message as aborted and remove thinking indicator
    setMessages((prev) => {
      const filtered = prev.filter((m) => !m.isThinking);
      // Mark the aborted message
      if (abortedMessageId) {
        return filtered.map((m) =>
          m.id === abortedMessageId ? { ...m, aborted: true } : m
        );
      }
      return filtered;
    });
    wsClient?.abort();
  }, [
    wsClient,
    setIsLoading,
    setMessages,
    currentMessageRef,
    currentMessageIdRef,
    thinkingStartTimeRef,
    currentToolInvocationsRef,
  ]);

  const append = useCallback((message: { role: "user"; content: string }) => {
    const newMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: message.role,
      content: message.content,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, [setMessages]);

  const handleNewConversation = useCallback(async () => {
    console.log("[New Conversation] Clearing all messages and starting fresh");

    // Generate new conversation ID FIRST (before clearing messages)
    const newConvId = generateNewConvId();
    console.log("[New Conversation] Generated new conversation ID:", newConvId);

    // For embed mode, create new chat file on backend with the NEW convId
    if (isEmbedMode && projectId) {
      try {
        console.log("[New Conversation] Creating new chat file on backend with convId:", newConvId);
        await createNewChat(projectId, newConvId);
        console.log("[New Conversation] New chat file created successfully");
      } catch (error) {
        console.error("[New Conversation] Failed to create new chat file:", error);
        // Continue anyway - the chat will still work
      }
    }

    // Clear all messages
    setMessages(() => []);

    // Clear input
    setInput("");

    // Clear error
    setError(null);

    // Clear todos
    setTodos(null);

    // Reset loading state
    setIsLoading(false);

    // Clear all refs
    currentMessageRef.current = null;
    currentMessageIdRef.current = null;
    currentToolInvocationsRef.current.clear();
    currentPartsRef.current = [];
    thinkingStartTimeRef.current = null;
    isSubmittingRef.current = false;

    // Disconnect websocket to force reconnection with new convId
    if (wsClient && wsClient.isConnected()) {
      console.log("[New Conversation] Disconnecting websocket to force reconnection");
      wsClient.disconnect();
    }

    // Reconnect with new convId after a short delay to ensure clean disconnect
    setTimeout(() => {
      if (wsClient) {
        console.log("[New Conversation] Reconnecting with new convId:", newConvId);
        wsClient.connect().catch((error) => {
          console.error("[New Conversation] Failed to reconnect:", error);
          setError("Failed to connect to server");
        });
      }
    }, 100);

    console.log("[New Conversation] Successfully cleared conversation");
  }, [
    wsClient,
    setMessages,
    setInput,
    setError,
    setTodos,
    setIsLoading,
    generateNewConvId,
    currentMessageRef,
    currentMessageIdRef,
    currentToolInvocationsRef,
    currentPartsRef,
    thinkingStartTimeRef,
    isEmbedMode,
    projectId,
  ]);

  return {
    handleSubmit,
    abort,
    append,
    handleNewConversation,
  };
}
