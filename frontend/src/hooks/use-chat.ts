import { useEffect, useCallback, useRef } from "react";
import { WSClient } from "@/lib/ws/ws-client";
import type { Message } from "@/components/ui/chat";
import { uploadFiles } from "@/lib/file-upload";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/stores/project-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFileStore } from "@/stores/file-store";

export interface UseChatOptions {
  wsUrl: string;
  onError?: (error: Error) => void;
  onStatusChange?: (status: string) => void;
}

export interface UseChatReturn {
  messages: Message[];
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (e?: React.FormEvent, options?: { experimental_attachments?: FileList }) => Promise<void>;
  isLoading: boolean;
  connectionStatus: string;
  processingStatus: string | null;
  error: string | null;
  clearHistory: () => void;
  abort: () => void;
  isConnected: boolean;
}

export function useChat({ wsUrl, onError, onStatusChange }: UseChatOptions): UseChatReturn {
  // Zustand stores
  const {
    messages,
    input,
    isLoading,
    connectionStatus,
    processingStatus,
    error,
    setMessages,
    setInput,
    setIsLoading,
    setConnectionStatus,
    setProcessingStatus,
    setError,
  } = useChatStore();

  const { currentProject } = useProjectStore();

  const wsClientRef = useRef<WSClient | null>(null);
  const currentMessageRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Initialize WebSocket client
  useEffect(() => {
    // Don't connect if no project is selected
    if (!currentProject?.id) {
      setConnectionStatus("disconnected");
      setError("No project selected. Please select a project to start chatting.");
      return;
    }

    console.log(`[useChat] Initializing WebSocket for project: ${currentProject.id}`);

    const wsClient = new WSClient({
      url: wsUrl,
      projectId: currentProject.id,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      timeout: 10000,
    });

    wsClientRef.current = wsClient;

    // Set up event handlers
    const handleConnected = () => {
      setConnectionStatus("connected");
      setError(null);
      onStatusChange?.("connected");
    };

    const handleDisconnected = () => {
      setConnectionStatus("disconnected");
      setIsLoading(false);
      onStatusChange?.("disconnected");
    };

    const handleReconnecting = () => {
      setConnectionStatus("reconnecting");
      onStatusChange?.("reconnecting");
    };

    const handleError = (error: Error) => {
      setError(error.message);
      setIsLoading(false);
      onError?.(error);
    };

    const handleLLMChunk = (data: { chunk: string; sequence?: number }) => {
      // If we have a current message being built, append to it
      if (currentMessageRef.current && currentMessageIdRef.current) {
        currentMessageRef.current += data.chunk;

        setMessages(prev => prev.map(msg =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, content: currentMessageRef.current!, isComplete: false }
            : msg
        ));
      } else {
        // Start a new assistant message
        const messageId = `msg_${Date.now()}_assistant`;
        currentMessageIdRef.current = messageId;
        currentMessageRef.current = data.chunk;

        const newMessage: Message = {
          id: messageId,
          role: "assistant",
          content: data.chunk,
          createdAt: new Date(),
        };

        setMessages(prev => [...prev, newMessage]);
      }
    };

    const handleLLMComplete = (data: { fullText: string; messageId: string }) => {
      // Finalize the current message
      if (currentMessageIdRef.current) {
        setMessages(prev => prev.map(msg =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, content: data.fullText }
            : msg
        ));
      }

      currentMessageRef.current = null;
      currentMessageIdRef.current = null;
      setIsLoading(false);
    };

    const handleCommunicationError = (data: { code: string; message: string }) => {
      setError(`Communication error: ${data.message}`);
      setIsLoading(false);

      // Add error message to chat
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: `Error: ${data.message}`,
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    };

    const handleStatus = (data: any) => {
      // Connection-related status
      if (data.status === 'connected' || data.status === 'disconnected' || data.status === 'reconnecting') {
        setConnectionStatus(data.status);
        onStatusChange?.(data.status);
      }

      // Processing-related status (file uploads, extension processing, etc.)
      if (data.status === 'processing' || data.status === 'complete') {
        const { setProcessingStatus } = useChatStore.getState();
        setProcessingStatus(data.message || null);

        // Auto-clear processing status after 5 seconds if it's 'complete'
        if (data.status === 'complete') {
          setTimeout(() => {
            setProcessingStatus(null);
          }, 5000);
        }
      }

      // File update status - when an extension finishes processing a file
      if (data.status === 'file_updated') {
        try {
          const update = JSON.parse(data.message);
          const { setFiles } = useFileStore.getState();
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.name === update.fileName ? { ...f, description: update.description } : f
            )
          );
        } catch (e) {
          console.error('[useChat] Failed to parse file update:', data.message);
        }
      }
    };

    const handleAuthFailed = (data: { code: number; reason: string }) => {
      // Authentication failure - logout the user
      console.error("[Auth Failed] WebSocket authentication failed:", data);
      const { logout } = useAuthStore.getState();
      logout();
    };

    // Register event listeners
    wsClient.on("connected", handleConnected);
    wsClient.on("disconnected", handleDisconnected);
    wsClient.on("reconnecting", handleReconnecting);
    wsClient.on("error", handleError);
    wsClient.on("llm_chunk", handleLLMChunk);
    wsClient.on("llm_complete", handleLLMComplete);
    wsClient.on("communication_error", handleCommunicationError);
    wsClient.on("status", handleStatus);
    wsClient.on("auth_failed", handleAuthFailed);

    // Connect to WebSocket
    wsClient.connect().catch(handleError);

    return () => {
      wsClient.off("auth_failed", handleAuthFailed);
      wsClient.disconnect();
    };
  }, [wsUrl, currentProject?.id, onError, onStatusChange]);

  const handleSubmit = useCallback(async (e?: React.FormEvent, options?: { experimental_attachments?: FileList }) => {
    e?.preventDefault();

    if (!input.trim() || !wsClientRef.current?.isConnected()) {
      return;
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      let fileIds: string[] | undefined;

      // Upload files via HTTP if provided
      if (options?.experimental_attachments && options.experimental_attachments.length > 0) {
        if (!currentProject) {
          throw new Error("No project selected");
        }
        const files = Array.from(options.experimental_attachments);
        const uploadedFiles = await uploadFiles(files, { projectId: currentProject.id });
        fileIds = uploadedFiles.map(f => f.id);
        console.log(`Uploaded ${uploadedFiles.length} files:`, fileIds);
      }

      // Send text message via WebSocket with file references
      await wsClientRef.current!.sendMessage(input.trim(), { fileIds });
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : "Failed to send message");

      // Remove the user message if send failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    }
  }, [input]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    wsClientRef.current?.clearHistory();
  }, []);

  const abort = useCallback(() => {
    setIsLoading(false);
    currentMessageRef.current = null;
    currentMessageIdRef.current = null;
    wsClientRef.current?.abort();
  }, []);

  const isConnected = wsClientRef.current?.isConnected() ?? false;

  return {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    connectionStatus,
    processingStatus,
    error,
    clearHistory,
    abort,
    isConnected,
  };
}