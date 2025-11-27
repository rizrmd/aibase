"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chat } from "@/components/ui/chat";
import type { Message } from "@/components/ui/chat-message";
import { useConvId } from "@/lib/conv-id";
import { useWSConnection } from "@/lib/ws/ws-connection-manager";
import { activeTabManager } from "@/lib/ws/active-tab-manager";
import {
  AlertCircle
} from "lucide-react";
import { lazy, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";

// Lazy load debug component only in development
const ConvIdDebug = process.env.NODE_ENV === "development"
  ? lazy(() => import("@/components/debug/conv-id-debug").then(mod => ({ default: mod.ConvIdDebug })))
  : null;

interface ShadcnChatInterfaceProps {
  wsUrl: string;
  className?: string;
}

export function ShadcnChatInterface({ wsUrl, className }: ShadcnChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [error, setError] = useState<string | null>(null);

  // Use the client ID management hook
  const { convId, metadata: convMetadata } = useConvId();

  
  // Use WebSocket connection manager - this ensures only one connection even with Strict Mode
  const wsClient = useWSConnection({
    url: wsUrl,
    reconnectAttempts: 5,
    reconnectDelay: 1000,
    heartbeatInterval: 30000,
    timeout: 10000,
  });

  
  const currentMessageRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Create a stable component reference for tab management
  const componentRef = useRef({});

  // Debug: Track messages state changes
  useEffect(() => {
    console.log(`[State-Effect] Messages state changed:`, {
      count: messages.length,
      messages: messages.map(m => ({ id: m.id, role: m.role, contentLength: m.content.length, contentPreview: m.content.substring(0, 50) }))
    });
  }, [messages]);

  // Set up WebSocket event handlers using the managed connection
  useEffect(() => {
    if (!wsClient) return;

    console.log("[Setup] Registering event handlers for convId:", convId);

    // Register this tab as active for this conversation
    activeTabManager.registerTab(componentRef.current, convId);

    // Set up event handlers
    const handleConnected = () => {
      // Only active tab handles connection events
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      setConnectionStatus("connected");
      setError(null);
      // Request message history from server when connected
      wsClient.getHistory();
    };

    const handleDisconnected = () => {
      setConnectionStatus("disconnected");
      setIsLoading(false);
    };

    const handleReconnecting = () => {
      setConnectionStatus("reconnecting");
    };

    const handleError = (error: Error) => {
      setError(error.message);
      setIsLoading(false);
    };

    const handleLLMChunk = (data: { chunk: string; messageId?: string; sequence?: number; isAccumulated?: boolean }) => {
      // Only active tab processes chunks
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("ShadcnChatInterface: handleLLMChunk called with:", data);

      // Don't process empty chunks
      if (!data.chunk || data.chunk.trim() === '') {
        console.log("Skipping empty chunk");
        return;
      }

      const messageId = data.messageId || `msg_${Date.now()}_assistant`;

      flushSync(() => {
        setMessages(prev => {
          console.log(`[State] Current messages count: ${prev.length}, isAccumulated: ${data.isAccumulated}`);

        if (data.isAccumulated) {
          // Accumulated chunks on reconnect
          console.log(`[Chunk-Accumulated] Received ${data.chunk.length} chars for message ${messageId}`);

          // First, try to find message by ID
          let existingIndex = prev.findIndex(m => m.id === messageId);

          // If not found by ID, look for the last empty assistant message (from history)
          if (existingIndex === -1) {
            console.log(`[Chunk-Accumulated] Message ID ${messageId} not found, looking for empty assistant message`);
            existingIndex = prev.findIndex(m => m.role === "assistant" && (!m.content || m.content.trim() === ''));
            if (existingIndex !== -1) {
              console.log(`[Chunk-Accumulated] Found empty assistant message at index ${existingIndex}, will update it and change ID to ${messageId}`);
            }
          }

          console.log(`[Chunk-Accumulated] Final message index: ${existingIndex}`);

          if (existingIndex !== -1) {
            // Update existing message with accumulated content and correct ID
            console.log(`[Chunk-Accumulated] Updating message at index ${existingIndex} with content length ${data.chunk.length}`);
            const updatedMessages = prev.map((msg, idx) =>
              idx === existingIndex
                ? { ...msg, id: messageId, content: data.chunk }
                : msg
            );

            // Store in refs for completion handler
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = data.chunk;

            console.log(`[Chunk-Accumulated] Returning ${updatedMessages.length} messages`);
            return updatedMessages;
          } else {
            // Create new message with accumulated content
            console.log(`[Chunk-Accumulated] Creating new message ${messageId} with accumulated content (${data.chunk.length} chars)`);
            const newMessage: Message = {
              id: messageId,
              role: "assistant",
              content: data.chunk,
              createdAt: new Date(),
            };

            // Store in refs for completion handler
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = data.chunk;

            const newMessages = [...prev, newMessage];
            console.log(`[Chunk-Accumulated] Returning ${newMessages.length} messages (added new)`);
            return newMessages;
          }
        } else {
          // Real-time chunk - check if message already exists in array
          const existingIndex = prev.findIndex(m => m.id === messageId);
          console.log(`[Chunk] Searching for message ${messageId}, found at index: ${existingIndex}, prev.length: ${prev.length}`);

          if (existingIndex === -1) {
            // Create new message
            console.log(`[Chunk] Creating new message: ${messageId} with chunk "${data.chunk.substring(0, 20)}..."`);
            const newMessage: Message = {
              id: messageId,
              role: "assistant",
              content: data.chunk,
              createdAt: new Date(),
            };

            // Store in refs
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = data.chunk;

            const newArray = [...prev, newMessage];
            console.log(`[Chunk] Returning new array with ${newArray.length} messages`);
            return newArray;
          } else {
            // Append to existing message
            const existingMessage = prev[existingIndex];
            console.log(`[Chunk] Found existing message at index ${existingIndex}, current content length: ${existingMessage.content.length}`);
            const newContent = existingMessage.content + data.chunk;

            // Update refs
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = newContent;

            console.log(`[Chunk] Appending "${data.chunk.substring(0, 20)}..." (chunk size: ${data.chunk.length}) -> total: ${newContent.length} chars`);

            const updatedArray = prev.map((msg, idx) =>
              idx === existingIndex
                ? { ...msg, content: newContent }
                : msg
            );
            console.log(`[Chunk] Returning updated array with ${updatedArray.length} messages`);
            return updatedArray;
          }
        }
        });
      });

      // Add logging to verify state update completed
      console.log(`[State] setMessages completed for ${messageId}`);
    };

    const handleLLMComplete = (data: { fullText: string; messageId: string; isAccumulated?: boolean }) => {
      // Only active tab processes completion
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("ShadcnChatInterface: handleLLMComplete called with:", {
        messageId: data.messageId,
        contentLength: data.fullText.length,
        isAccumulated: data.isAccumulated
      });

      // Don't process empty completions
      const fullText = data.fullText || '';
      if (!fullText) {
        console.log("Skipping empty completion");
        currentMessageRef.current = null;
        currentMessageIdRef.current = null;
        setIsLoading(false);
        return;
      }

      setMessages(prev => {
        console.log(`[Complete] Processing completion for message ${data.messageId} (${fullText.length} chars, accumulated: ${data.isAccumulated})`);

        // Try to update message by ID
        const messageIndex = prev.findIndex(m => m.id === data.messageId);

        if (messageIndex !== -1) {
          // Message already exists from streaming chunks
          const existingMessage = prev[messageIndex];
          console.log(`[Complete] Message ${data.messageId} already exists with ${existingMessage.content.length} chars from streaming`);
          console.log(`[Complete] Backend fullText has ${fullText.length} chars`);

          // Don't replace content if we already accumulated chunks during streaming
          // Only use fullText if the message was created without chunks (e.g., on reconnect)
          if (existingMessage.content.length > 0 && !data.isAccumulated) {
            console.log(`[Complete] Keeping streamed content (${existingMessage.content.length} chars), ignoring fullText`);
            return prev; // No change needed, we already have the complete content from streaming
          }

          // Use fullText only for accumulated messages on reconnect
          console.log(`[Complete] Using fullText for ${data.isAccumulated ? 'accumulated' : 'empty'} message`);
          return prev.map((msg, idx) =>
            idx === messageIndex
              ? { ...msg, content: fullText }
              : msg
          );
        }

        // Message not found - create one with fullText
        console.warn(`[Complete] Message ${data.messageId} not found, creating new message with fullText`);
        const newMessage: Message = {
          id: data.messageId,
          role: "assistant",
          content: fullText,
          createdAt: new Date(),
        };
        return [...prev, newMessage];
      });

      // Clear refs after completion
      currentMessageRef.current = null;
      currentMessageIdRef.current = null;
      setIsLoading(false);

      console.log("Completion handling complete");
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

    const handleStatus = (data: { status?: string }) => {
      if (data.status) {
        setConnectionStatus(data.status);
      }
    };

    const handleHistoryResponse = (data: { messages?: any[] }) => {
      console.log("handleHistoryResponse called with:", data);
      if (data.messages && Array.isArray(data.messages)) {
        console.log("Converting messages:", data.messages);
        // Convert server messages to Message format and filter out empty messages
        const serverMessages: Message[] = data.messages
          .map((msg, index) => {
            // Prefer server-provided ID, fall back to generated ID
            const messageId = msg.id || `history_${Date.now()}_${index}`;
            console.log(`[History] Message ${index}: role=${msg.role}, id=${messageId}, content length=${(msg.content || '').length}`);

            return {
              id: messageId,
              role: msg.role || "assistant",
              content: msg.content || msg.text || "",
              createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
            };
          })
          .filter(msg => msg.content.trim().length > 0); // Filter out empty messages

        console.log("Setting messages to:", serverMessages);
        console.log("First message structure:", serverMessages[0]);
        console.log("Messages state will be updated to:", serverMessages.length, "messages");

        // IMPORTANT: Merge with current state instead of replacing it
        // This prevents history from overwriting streamed content
        setMessages(prev => {
          // If we have no current messages, just use server messages
          if (prev.length === 0) {
            console.log("[History] No existing messages, using server messages");
            return serverMessages;
          }

          // If we have messages, merge smartly
          console.log(`[History] Merging with ${prev.length} existing messages`);
          const merged = [...serverMessages];

          // For each existing message, check if it has MORE content than the server version
          // This handles the case where streaming accumulated more content than what's in history
          prev.forEach(existingMsg => {
            const serverMsgIndex = merged.findIndex(m => m.id === existingMsg.id);

            if (serverMsgIndex !== -1) {
              const serverMsg = merged[serverMsgIndex];
              // Keep the version with more content (streaming version beats history)
              if (existingMsg.content.length > serverMsg.content.length) {
                console.log(`[History] Keeping streamed version of ${existingMsg.id} (${existingMsg.content.length} chars > ${serverMsg.content.length} chars from history)`);
                merged[serverMsgIndex] = existingMsg;
              } else {
                console.log(`[History] Using history version of ${existingMsg.id} (${serverMsg.content.length} chars >= ${existingMsg.content.length} chars from stream)`);
              }
            } else {
              // Message exists locally but not in history (shouldn't happen, but handle it)
              console.log(`[History] Message ${existingMsg.id} exists locally but not in history, keeping it`);
              merged.push(existingMsg);
            }
          });

          return merged;
        });
      } else {
        console.log("No messages to process or messages is not an array");
      }
    };

    const handleControl = (data: any) => {
      console.log("handleControl called with:", data);
      if (data.status === "history" || data.type === "history_response") {
        console.log("Processing history data:", data.history);
        handleHistoryResponse({ messages: data.history || [] });
      }
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
    wsClient.on("control", handleControl);

    // Connect to WebSocket (connection manager handles multiple calls gracefully)
    wsClient.connect().catch(handleError);

    // Cleanup function - just remove event listeners, connection manager handles disconnection
    return () => {
      console.log("[Setup] Cleaning up event handlers for convId:", convId);

      // Unregister this tab
      activeTabManager.unregisterTab(componentRef.current, convId);

      wsClient.off("connected", handleConnected);
      wsClient.off("disconnected", handleDisconnected);
      wsClient.off("reconnecting", handleReconnecting);
      wsClient.off("error", handleError);
      wsClient.off("llm_chunk", handleLLMChunk);
      wsClient.off("llm_complete", handleLLMComplete);
      wsClient.off("communication_error", handleCommunicationError);
      wsClient.off("status", handleStatus);
      wsClient.off("control", handleControl);
    };
  }, [wsClient, convId]); // Include wsClient and convId in dependencies

  const handleSubmit = useCallback(async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();

    if (!input.trim() || !wsClient?.isConnected()) {
      return;
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      await wsClient.sendMessage(messageText);
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : "Failed to send message");

      // Remove the user message if send failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    }
  }, [input, wsClient]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    wsClient?.clearHistory();
  }, [wsClient]);

  const abort = useCallback(() => {
    setIsLoading(false);
    currentMessageRef.current = null;
    currentMessageIdRef.current = null;
    wsClient?.abort();
  }, [wsClient]);

  const append = useCallback((message: { role: "user"; content: string }) => {
    const newMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: message.role,
      content: message.content,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const suggestions = [
    "What can you help me with?",
    "Tell me about your capabilities",
    "Help me write a function",
    "Explain machine learning",
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-500";
      case "connecting":
      case "reconnecting":
        return "bg-yellow-500";
      case "disconnected":
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return "Reconnecting...";
      case "disconnected":
        return "Disconnected";
      case "error":
        return "Error";
      default:
        return status;
    }
  };

  const [isConnected, setIsConnected] = useState(false);

  // Update connection status based on wsClient
  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(wsClient?.isConnected() ?? false);
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, [wsClient]);

  return (
    <div className={`flex flex-col h-screen ${className}`}>

      {/* Error Alert */}
      {error && (
        <Alert className="mx-4 mb-2 border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Development Debug Panel */}
      {/* {ConvIdDebug && (
        <div className="absolute top-4 right-4 z-50">
          <Suspense fallback={<div className="text-xs text-gray-500">Loading debug...</div>}>
            <ConvIdDebug />
          </Suspense>
        </div>
      )} */}

      <Chat
        messages={messages}
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isGenerating={isLoading}
        stop={abort}
        setMessages={setMessages}
        append={append}
        suggestions={messages.length === 0 ? suggestions : []}
        className="h-full"
      />

      {/* Debug: Log messages being passed to Chat component */}
      <div style={{ position: 'fixed', bottom: 10, left: 10, background: 'rgba(0,255,0,0.2)', padding: '5px', fontSize: '10px' }}>
        Chat messages: {messages.length} | System: {messages.filter(m => m.role === 'system').length} | User: {messages.filter(m => m.role === 'user').length} | Assistant: {messages.filter(m => m.role === 'assistant').length}
      </div>

      {/* Debug: Show message details */}
      <div style={{ position: 'fixed', bottom: 30, left: 10, background: 'rgba(255,255,0,0.2)', padding: '5px', fontSize: '9px', maxWidth: '300px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ borderBottom: '1px solid #333', paddingBottom: '2px' }}>
            <strong>{msg.role}:</strong> "{msg.content}" (len: {msg.content.length})
          </div>
        ))}
      </div>

      
      {/* <div className="flex-1 px-4 pb-4 min-h-0">
        <div className="flex flex-rpw">

          <div className="p-4 border-t bg-background">
            <div className="flex gap-2 justify-end">

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  {isConnected ? (
                    <Wifi className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {getStatusText(connectionStatus)}
                </Badge>
                <div className={`w-2 h-2 rounded-full ${getStatusColor(connectionStatus)}`} />
              </div>

              {isLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={abort}
                  disabled={!isConnected}
                  title="Stop generation"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearHistory}
                disabled={messages.length === 0 || !isConnected}
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </div>
        <div className="h-full bg-white flex flex-col">
          <div className="flex-1">
          </div>
        </div>
      </div> */}


    </div>
  );
}