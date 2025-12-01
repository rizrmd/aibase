"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chat, type Message } from "@/components/ui/chat";
import { TodoPanel } from "@/components/todo-panel";
import { CompactionStatus } from "@/components/compaction-status";
import { useConvId } from "@/lib/conv-id";
import { useWSConnection } from "@/lib/ws/ws-connection-manager";
import { useChatStore } from "@/stores/chat-store";
import { useFileStore } from "@/stores/file-store";
import { AlertCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useWebSocketHandlers } from "@/hooks/use-websocket-handlers";
import { useMessageSubmission } from "@/hooks/use-message-submission";
import { useShallow } from "zustand/react/shallow";

interface ShadcnChatInterfaceProps {
  wsUrl: string;
  className?: string;
  isTodoPanelVisible?: boolean;
}

export function MainChat({ wsUrl, className, isTodoPanelVisible = true }: ShadcnChatInterfaceProps) {

  // Zustand stores (reactive state only)
  const {
    messages,
    input,
    isLoading,
    error,
    todos,
    setMessages,
    setInput,
    setIsLoading,
    setError,
    setTodos,
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      input: state.input,
      isLoading: state.isLoading,
      error: state.error,
      todos: state.todos,
      setMessages: state.setMessages,
      setInput: state.setInput,
      setIsLoading: state.setIsLoading,
      setError: state.setError,
      setTodos: state.setTodos,
    }))
  );

  const { uploadProgress, setUploadProgress } = useFileStore(
    useShallow((state) => ({
      uploadProgress: state.uploadProgress,
      setUploadProgress: state.setUploadProgress,
    }))
  );

  // Use the client ID management hook
  const { convId, generateNewConvId } = useConvId();

  // Use WebSocket connection manager - this ensures only one connection even with Strict Mode
  const wsClient = useWSConnection({
    url: wsUrl,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
    heartbeatInterval: 30000,
    timeout: 10000,
  });

  // Keep refs as regular useRef (non-reactive tracking for streaming)
  const currentMessageRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const currentToolInvocationsRef = useRef<Map<string, any>>(new Map());
  const currentPartsRef = useRef<any[]>([]);

  // Create a stable component reference for tab management
  const componentRef = useRef({});

  // Track thinking indicator start time
  const thinkingStartTimeRef = useRef<number | null>(null);

  // Update thinking indicator seconds every second
  useEffect(() => {
    // Only set interval if thinking indicator exists
    const hasThinking = messages.some((m) => m.isThinking);

    if (!hasThinking || thinkingStartTimeRef.current === null) {
      return;
    }

    const intervalId = setInterval(() => {
      const elapsedSeconds = Math.floor(
        (Date.now() - thinkingStartTimeRef.current!) / 1000
      );

      setMessages((prev) => {
        const thinkingIndex = prev.findIndex((m) => m.isThinking);
        if (thinkingIndex === -1) return prev;

        const updated = [...prev];
        updated[thinkingIndex] = {
          ...updated[thinkingIndex],
          content: `Thinking... ${elapsedSeconds}s`,
        };
        return updated;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [messages.some((m) => m.isThinking), thinkingStartTimeRef.current]);

  // Set up WebSocket event handlers
  useWebSocketHandlers({
    wsClient,
    convId,
    componentRef,
    setMessages,
    setIsLoading,
    setError,
    setTodos,
    isLoading,
    thinkingStartTimeRef,
    currentMessageRef,
    currentMessageIdRef,
    currentToolInvocationsRef,
    currentPartsRef,
  });

  // Use message submission hook
  const { handleSubmit, abort, append, handleNewConversation } =
    useMessageSubmission({
      wsClient,
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
    });

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  const handleNewConversationWithConfirm = useCallback(() => {
    const confirmed = window.confirm(
      "Are you sure you want to start a new conversation? This will clear the current chat and todos."
    );
    if (confirmed) {
      handleNewConversation();
    }
  }, [handleNewConversation]);

  const suggestions = [
    "What can you help me with?",
    "Tell me about your capabilities",
    "Help me write a function",
    "Explain machine learning",
  ];

  return (
    <div className={`flex h-screen ${className} relative`}>
      {/* New Conversation Button - Absolute positioned top right (only show if messages exist) */}
      {messages.length > 0 && (
        <Button
          onClick={handleNewConversationWithConfirm}
          size="sm"
          variant="outline"
          className="absolute top-4 right-4 z-10 shadow-md"
          title="Start a new conversation"
        >
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      )}

      {/* Conversation ID - Bottom left corner */}
      <div className="absolute bottom-2 right-2 z-10 text-xs text-muted-foreground font-mono">
        {convId}
      </div>

      {/* Todo Panel - Sticky on left */}
      {(todos?.items?.length > 0 || isLoading) && (
        <div className="mt-[60px] ml-3.5">
          <TodoPanel
            todos={todos}
            isLoading={isLoading && !todos?.items?.length}
            isVisible={isTodoPanelVisible}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Error Alert */}
        {error && (
          <Alert className="mx-4 mb-2 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Upload Progress */}
        {uploadProgress !== null && (
          <Alert className="mx-4 mb-2 border-blue-200 bg-blue-50">
            <AlertDescription className="text-blue-800">
              <div className="flex items-center gap-2">
                <span>Uploading files... {uploadProgress}%</span>
                <div className="flex-1 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Compaction Status - Show when messages exist */}
        {messages.length > 0 && (
          <div className="mx-4 mb-2">
            <CompactionStatus wsClient={wsClient} />
          </div>
        )}

        <Chat
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isGenerating={isLoading}
          stop={abort}
          setMessages={setMessages}
          append={append}
          className="h-full"
          uploadProgress={uploadProgress}
        />
      </div>
    </div>
  );
}
