"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chat } from "@/components/ui/chat";
import type { Message } from "@/components/ui/chat-message";
import { TodoPanel } from "@/components/todo-panel";
import { useConvId } from "@/lib/conv-id";
import { useWSConnection } from "@/lib/ws/ws-connection-manager";
import { useChatStore } from "@/stores/chat-store";
import { useFileStore } from "@/stores/file-store";
import { AlertCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useWebSocketHandlers } from "@/hooks/use-websocket-handlers";
import { useMessageSubmission } from "@/hooks/use-message-submission";

interface ShadcnChatInterfaceProps {
  wsUrl: string;
  className?: string;
}

export function MainChat({ wsUrl, className }: ShadcnChatInterfaceProps) {
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
  } = useChatStore();

  const { uploadProgress, setUploadProgress } = useFileStore();

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

  // Debug: Track messages state changes
  useEffect(() => {
    console.log(`[State-Effect] Messages state changed:`, {
      count: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        contentLength: m.content.length,
        contentPreview: m.content.substring(0, 50),
        completionTime: m.completionTime,
        isThinking: m.isThinking,
      })),
    });
  }, [messages]);

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
          onClick={handleNewConversation}
          size="sm"
          variant="outline"
          className="absolute top-4 right-4 z-10 shadow-md"
          title="Start a new conversation"
        >
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      )}

      {/* Todo Panel - Sticky on left */}
      {todos?.items?.length > 0 && (
        <TodoPanel todos={todos} isLoading={false} />
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
