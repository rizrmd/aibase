import { useCallback, useRef } from "react";
import type { Message } from "@/components/ui/chat";
import type { WSClient } from "@/lib/ws/ws-connection-manager";
import { uploadFilesWithProgress } from "@/lib/file-upload";

interface UseMessageSubmissionProps {
  wsClient: WSClient | null;
  projectId: string | undefined;
  input: string;
  setInput: (input: string) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTodos: (todos: any) => void;
  setUploadProgress: (progress: number | null) => void;
  isLoading: boolean;
  thinkingStartTimeRef: React.MutableRefObject<number | null>;
  currentMessageRef: React.MutableRefObject<string | null>;
  currentMessageIdRef: React.MutableRefObject<string | null>;
  currentToolInvocationsRef: React.MutableRefObject<Map<string, any>>;
  currentPartsRef: React.MutableRefObject<any[]>;
  generateNewConvId: () => string;
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
}: UseMessageSubmissionProps) {
  // Track if we're currently submitting to prevent double submissions
  const isSubmittingRef = useRef(false);

  const handleSubmit = useCallback(
    async (
      e?: { preventDefault?: () => void },
      options?: { experimental_attachments?: FileList }
    ) => {
      e?.preventDefault?.();

      console.log(
        "[Submit] Called with input:",
        input?.substring(0, 50),
        "isConnected:",
        wsClient?.isConnected(),
        "attachments:",
        options?.experimental_attachments?.length || 0
      );

      if (!input.trim() || !wsClient?.isConnected()) {
        console.log("[Submit] Skipping - no input or not connected");
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
        let fileListText = "";

        // Upload files FIRST if any are attached
        if (options?.experimental_attachments && options.experimental_attachments.length > 0) {
          console.log("[Submit] Uploading", options.experimental_attachments.length, "files");
          setUploadProgress(0);

          try {
            const filesArray = Array.from(options.experimental_attachments);

            if (!projectId) {
              throw new Error("Project ID is required for file uploads");
            }

            uploadedFiles = await uploadFilesWithProgress(filesArray, {
              projectId,
              onProgress: (progress) => {
                console.log("[Upload Progress]", progress.percentage + "%");
                setUploadProgress(progress.percentage);
              }
            });

            console.log("[Submit] Files uploaded successfully:", uploadedFiles);
            setUploadProgress(null);

            // Create a simple text list for the backend
            fileListText = "\n\n[Files: " +
              uploadedFiles.map(f => f.name).join(", ") +
              "]";
          } catch (uploadError) {
            console.error("[Submit] File upload failed:", uploadError);
            setUploadProgress(null);
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
        // Send message with file list to backend (for context)
        await wsClient.sendMessage(messageText + fileListText);
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

  const handleNewConversation = useCallback(() => {
    console.log("[New Conversation] Clearing all messages and starting fresh");

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

    // Generate new conversation ID and store in local storage
    const newConvId = generateNewConvId();
    console.log("[New Conversation] Generated new conversation ID:", newConvId);

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
  ]);

  return {
    handleSubmit,
    abort,
    append,
    handleNewConversation,
  };
}
