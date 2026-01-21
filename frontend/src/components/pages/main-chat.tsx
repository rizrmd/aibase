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
import { PageActionButton, PageActionGroup } from "@/components/ui/page-action-button";
import { useWebSocketHandlers } from "@/hooks/use-websocket-handlers";
import { useMessageSubmission } from "@/hooks/use-message-submission";
import { useShallow } from "zustand/react/shallow";

interface ShadcnChatInterfaceProps {
  wsUrl: string;
  className?: string;
  isTodoPanelVisible?: boolean;
  isEmbedMode?: boolean;
  welcomeMessage?: string | null;
  // Optional: Override conversation ID management for embed mode
  embedConvId?: string;
  embedGenerateNewConvId?: () => string;
  // Embed specific auth props
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
  // Zustand stores (reactive state only)
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
    }))
  );

  const { uploadProgress, setUploadProgress } = useFileStore(
    useShallow((state) => ({
      uploadProgress: state.uploadProgress,
      setUploadProgress: state.setUploadProgress,
    }))
  );

  // Get current project
  const { currentProject } = useProjectStore();

  // Use the client ID management hook (or use embed mode overrides)
  const defaultConvIdHook = useConvId();
  const convId = embedConvId ?? defaultConvIdHook.convId;
  const generateNewConvId = embedGenerateNewConvId ?? defaultConvIdHook.generateNewConvId;

  // Use WebSocket connection manager - this ensures only one connection even with Strict Mode
  const wsClient = useWSConnection({
    url: wsUrl,
    projectId: projectId ?? currentProject?.id, // Use prop if provided (embed mode), else store
    uid, // Pass uid for embed auth
    embedToken, // Pass embedToken for embed auth
    convId: embedConvId, // Pass embed convId if in embed mode
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

  // Track thinking indicator start time (server sends this timestamp)
  const thinkingStartTimeRef = useRef<number | null>(null);

  // Memoize whether we have a thinking message to avoid unnecessary effect re-runs
  const hasThinkingMessage = useMemo(() => messages.some((m) => m.isThinking), [messages]);

  // Update thinking indicator seconds every second based on server startTime
  useEffect(() => {
    // Only set interval if thinking indicator exists
    if (!hasThinkingMessage) {
      return;
    }

    const intervalId = setInterval(() => {
      // Check if we have startTime from server (may arrive after first render)
      if (thinkingStartTimeRef.current === null) {
        return;
      }

      const elapsedSeconds = Math.floor(
        (Date.now() - thinkingStartTimeRef.current) / 1000
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
  }, [hasThinkingMessage, setMessages]);

  // Set up WebSocket event handlers
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

  // Use message submission hook
  const { handleSubmit, abort, handleNewConversation } =
    useMessageSubmission({
      wsClient,
      projectId: currentProject?.id,
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
    });

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  // Load conversation messages when convId changes (for conversation switching)
  // NOTE: Disabled because WebSocket handler already loads messages via get_history control message
  // Having both REST API and WebSocket loading messages causes race conditions where tokenUsage gets lost
  // useEffect(() => {
  //   const loadConversationMessages = async () => {
  //     if (!convId || !currentProject?.id) return;

  //     // If messages are empty and we had a previously loaded conversation, reset the ref
  //     // This handles the case when starting a new conversation
  //     if (messages.length === 0 && lastLoadedConvIdRef.current !== null) {
  //       console.log("[MainChat] Messages cleared, resetting loaded conversation ref");
  //       lastLoadedConvIdRef.current = null;
  //     }

  //     // Skip if we've already loaded this conversation
  //     if (lastLoadedConvIdRef.current === convId) {
  //       console.log("[MainChat] Conversation already loaded:", convId);
  //       return;
  //     }

  //     try {
  //       console.log("[MainChat] Attempting to load messages for conversation:", convId);
  //       const conversationData = await fetchConversationMessages(convId, currentProject.id);

  //       if (conversationData.messages && conversationData.messages.length > 0) {
  //         // Convert backend messages to frontend format
  //         const loadedMessages: Message[] = conversationData.messages.map((msg: any, index: number) => ({
  //           id: `msg_${convId}_${index}`,
  //           role: msg.role,
  //           content: typeof msg.content === "string" ? msg.content : "",
  //           createdAt: new Date(),
  //           // Preserve tokenUsage, completionTime, and other metadata
  //           ...(msg.tokenUsage && { tokenUsage: msg.tokenUsage }),
  //           ...(msg.completionTime !== undefined && { completionTime: msg.completionTime }),
  //           ...(msg.toolInvocations && { toolInvocations: msg.toolInvocations }),
  //           ...(msg.parts && { parts: msg.parts }),
  //           ...(msg.aborted && { aborted: msg.aborted }),
  //         }));

  //         console.log("[MainChat] Loaded", loadedMessages.length, "messages from backend");
  //         setMessages(loadedMessages);

  //         // Mark this conversation as loaded
  //         lastLoadedConvIdRef.current = convId;
  //       } else {
  //         console.log("[MainChat] No messages found for conversation:", convId);
  //         // Mark as loaded even if empty to avoid repeated attempts
  //         lastLoadedConvIdRef.current = convId;
  //       }
  //     } catch (error) {
  //       console.error("[MainChat] Error loading conversation messages:", error);
  //       // Mark as loaded to avoid repeated failed attempts
  //       lastLoadedConvIdRef.current = convId;
  //     }
  //   };

  //   loadConversationMessages();
  // }, [convId, currentProject?.id, messages.length, setMessages]);

  // Auto-scroll to chat input on mobile when starting new conversation
  useEffect(() => {
    if (messages.length === 0 && window.innerWidth < 768) {
      // Scroll to bottom so user can see chat input
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length]);

  return (
    <div className={`flex h-screen-mobile ${className} relative`}>
      {/* New Conversation Button - Absolute positioned top right (hidden in embed mode) */}
      {!isEmbedMode && messages.length > 0 && (
        <PageActionGroup isFixedOnMobile={true}>
          <PageActionButton
            icon={Plus}
            label="New"
            onClick={handleNewConversation}
            variant="outline"
            size="sm"
            title="Start a new conversation"
            className="mb-2 py-1"
          />
        </PageActionGroup>
      )}

      {/* Token Status - Bottom right corner */}
      <div className={`absolute right-2 z-10 ${isEmbedMode ? 'top-2 hidden md:block' : 'bottom-20 md:bottom-2'}`}>
        <TokenStatus convId={convId} />
      </div>

      {/* Todo Panel - Sticky on left */}
      {(todos?.items?.length > 0 || isLoading) && (
        <div className="mt-[60px] ml-3.5">
          <TodoPanel
            todos={todos}
            isVisible={isTodoPanelVisible}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Error Alert */}
        {error && (
          <Alert className="mt-[60px] mx-auto mb-2 w-[650px] border-red-200 bg-red-50">
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
          isHistoryLoading={isHistoryLoading}
          stop={abort}
          setMessages={setMessages}
          className="h-full"
          uploadProgress={uploadProgress}
          welcomeMessage={welcomeMessage}
        />
      </div>
    </div>
  );
}
