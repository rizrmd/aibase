"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chat } from "@/components/ui/chat";
import { TodoPanel } from "@/components/status/todo-panel";
import { CompactionStatus } from "@/components/status/compaction-status";
import { TokenStatus } from "@/components/status/token-status";
import { useConvId } from "@/lib/conv-id";
import { useWSConnection } from "@/lib/ws/ws-connection-manager";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/stores/project-store";
import { useFileStore } from "@/stores/file-store";
import { AlertCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { PageActionButton } from "@/components/ui/page-action-button";
import { useWebSocketHandlers } from "@/hooks/use-websocket-handlers";
import { useMessageSubmission } from "@/hooks/use-message-submission";
import { useShallow } from "zustand/react/shallow";

interface ShadcnChatInterfaceProps {
  wsUrl: string;
  className?: string;
  isTodoPanelVisible?: boolean;
  isEmbedMode?: boolean;
  welcomeMessage?: string | null;
  embedConvId?: string;
  embedGenerateNewConvId?: () => string;
  uid?: string;
  embedToken?: string;
  projectId?: string;
}

export function MainChat({
  wsUrl,
  className,
  isTodoPanelVisible = true,
  isEmbedMode = false,
  welcomeMessage = null,
  embedConvId,
  embedGenerateNewConvId,
  uid,
  embedToken,
  projectId,
}: ShadcnChatInterfaceProps) {
  const {
    messages,
    input,
    isLoading,
    isHistoryLoading,
    error,
    todos,
    setMessages,
    setInput,
    setIsLoading,
    setIsHistoryLoading,
    setError,
    setTodos,
    setMaxTokens,
    setTokenUsage,
    updateMessage,
  } = useChatStore(
    useShallow((state) => ({
      messages: state.messages,
      input: state.input,
      isLoading: state.isLoading,
      isHistoryLoading: state.isHistoryLoading,
      error: state.error,
      todos: state.todos,
      setMessages: state.setMessages,
      setInput: state.setInput,
      setIsLoading: state.setIsLoading,
      setIsHistoryLoading: state.setIsHistoryLoading,
      setError: state.setError,
      setTodos: state.setTodos,
      setMaxTokens: state.setMaxTokens,
      setTokenUsage: state.setTokenUsage,
      updateMessage: state.updateMessage,
    }))
  );

  const { setUploadProgress } = useFileStore(
    useShallow((state) => ({ setUploadProgress: state.setUploadProgress }))
  );

  const { currentProject } = useProjectStore();
  const defaultConvIdHook = useConvId();
  const convId = embedConvId ?? defaultConvIdHook.convId;
  const generateNewConvId = embedGenerateNewConvId ?? defaultConvIdHook.generateNewConvId;

  const wsClient = useWSConnection({
    url: wsUrl,
    projectId: projectId ?? currentProject?.id,
    uid,
    embedToken,
    convId: embedConvId,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
    heartbeatInterval: 30000,
    timeout: 10000,
  });

  const currentMessageRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const currentToolInvocationsRef = useRef<Map<string, any>>(new Map());
  const currentPartsRef = useRef<any[]>([]);
  const componentRef = useRef({});
  const thinkingStartTimeRef = useRef<number | null>(null);

  const hasThinkingMessage = useMemo(() => messages.some((m) => m.isThinking), [messages]);

  useEffect(() => {
    if (!hasThinkingMessage) return;

    const intervalId = setInterval(() => {
      if (thinkingStartTimeRef.current === null) return;
      const elapsedSeconds = Math.floor((Date.now() - thinkingStartTimeRef.current) / 1000);

      setMessages((prev) => {
        const thinkingIndex = prev.findIndex((m) => m.isThinking);
        if (thinkingIndex === -1) return prev;
        const updated = [...prev];
        updated[thinkingIndex] = { ...updated[thinkingIndex], content: `Thinking... ${elapsedSeconds}s` };
        return updated;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [hasThinkingMessage, setMessages]);

  useWebSocketHandlers({
    wsClient,
    convId,
    componentRef,
    setMessages,
    setIsLoading,
    setIsHistoryLoading,
    setError,
    setTodos,
    setMaxTokens,
    setTokenUsage,
    isLoading,
    thinkingStartTimeRef,
    currentMessageRef,
    currentMessageIdRef,
    currentToolInvocationsRef,
    currentPartsRef,
  });

  const { handleSubmit, abort, handleNewConversation } = useMessageSubmission({
    wsClient,
    projectId: currentProject?.id,
    convId,
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
    isEmbedMode,
    updateMessage,
  });

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Top bar - fixed height */}
      <div className="h-12 md:h-14 flex items-center justify-between px-4 border-b flex-shrink-0">
        <div>
          {!isEmbedMode && messages.length > 0 && (
            <PageActionButton
              icon={Plus}
              label="New"
              onClick={handleNewConversation}
              variant="outline"
              size="sm"
              title="Start a new conversation"
            />
          )}
        </div>
        <div className={isEmbedMode ? "hidden md:block" : ""}>
          <TokenStatus convId={convId} />
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="mx-4 md:mx-auto mt-2 md:w-[650px] border-red-200 bg-red-50 flex-shrink-0">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Compaction Status */}
      {messages.length > 0 && (
        <div className="mx-4 mt-2 flex-shrink-0">
          <CompactionStatus wsClient={wsClient} />
        </div>
      )}

      {/* Chat - fills remaining space */}
      <div className="flex-1 min-h-0 relative">
        {(todos?.items?.length > 0 || isLoading) && (
          <div className="absolute left-2 top-2 z-10">
            <TodoPanel todos={todos} isVisible={isTodoPanelVisible} />
          </div>
        )}

        <Chat
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isGenerating={isLoading}
          isHistoryLoading={isHistoryLoading}
          stop={abort}
          setMessages={setMessages}
          className="h-full"
          welcomeMessage={welcomeMessage}
        />
      </div>
    </div>
  );
}
