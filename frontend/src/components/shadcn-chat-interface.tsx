"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chat } from "@/components/ui/chat";
import type { Message } from "@/components/ui/chat-message";
import { useConvId } from "@/lib/conv-id";
import { useWSConnection } from "@/lib/ws/ws-connection-manager";
import {
  AlertCircle
} from "lucide-react";
import { lazy, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

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

  // Set up WebSocket event handlers using the managed connection
  useEffect(() => {
    if (!wsClient) return;

    
    // Set up event handlers
    const handleConnected = () => {
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

    const handleLLMChunk = (data: { chunk: string; sequence?: number; isAccumulated?: boolean }) => {
      console.log("ShadcnChatInterface: handleLLMChunk called with:", data);

      // Don't process empty chunks
      if (!data.chunk || data.chunk.trim() === '') {
        console.log("Skipping empty chunk");
        return;
      }

      // For accumulated chunks, only process if they have substantial content
      if (data.isAccumulated && data.chunk.length < 10) {
        console.log("Skipping very short accumulated chunk:", data.chunk.length, "chars");
        return;
      }

      if (data.isAccumulated) {
        // For accumulated chunks, check if we already have an assistant message and update it
        // This prevents creating duplicate messages when both accumulated chunks and completions are received
        const trimmedContent = data.chunk.trim();
        const assistantMessages = messages.filter(msg => msg.role === 'assistant');

        if (assistantMessages.length > 0) {
          // Update the most recent assistant message with accumulated content
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
          console.log("Updating last assistant message with accumulated chunk:", { id: lastAssistantMessage.id, contentLength: trimmedContent.length });
          setMessages(prev => prev.map(msg =>
            msg.id === lastAssistantMessage.id
              ? { ...msg, content: trimmedContent }
              : msg
          ));
        } else {
          // Create a new message if no assistant message exists
          const messageId = `accumulated_${Date.now()}`;
          const newMessage: Message = {
            id: messageId,
            role: "assistant",
            content: trimmedContent,
            createdAt: new Date(),
          };

          console.log("Creating new message from accumulated chunk:", { id: messageId, contentLength: trimmedContent.length });
          setMessages(prev => [...prev, newMessage]);
        }
        return;
      }

      // Normal streaming - append to existing message or create new one
      if (currentMessageRef.current && currentMessageIdRef.current) {
        // Append to existing message (real-time streaming)
        currentMessageRef.current += data.chunk;

        console.log("Appending to existing message, new length:", currentMessageRef.current.length);
        setMessages(prev => prev.map(msg =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, content: currentMessageRef.current! }
            : msg
        ));
      } else {
        // Only start a new message if the chunk has substantial content
        if (data.chunk.length < 3) {
          console.log("Skipping very short initial chunk:", data.chunk.length, "chars");
          return;
        }

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

        console.log("Creating new assistant message:", { id: messageId, content: data.chunk.substring(0, 50) + '...' });
        setMessages(prev => [...prev, newMessage]);
      }
    };

    const handleLLMComplete = (data: { fullText: string; messageId: string; isAccumulated?: boolean }) => {
      console.log("ShadcnChatInterface: handleLLMComplete called with:", {
        messageId: data.messageId,
        contentLength: data.fullText.length,
        isAccumulated: data.isAccumulated
      });

      if (data.isAccumulated) {
        // For accumulated completions, find any recent assistant message and update it
        // or create a new one if none exists
        const assistantMessages = messages.filter(msg => msg.role === 'assistant');

        if (assistantMessages.length > 0) {
          // Update the most recent assistant message
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
          console.log("Updating last assistant message with accumulated completion");
          setMessages(prev => prev.map(msg =>
            msg.id === lastAssistantMessage.id
              ? { ...msg, content: data.fullText }
              : msg
          ));
        } else {
          // Create a new message if no assistant message exists
          console.log("Creating new message from accumulated completion");
          const newMessage: Message = {
            id: `accumulated_complete_${Date.now()}`,
            role: "assistant",
            content: data.fullText,
            createdAt: new Date(),
          };
          setMessages(prev => [...prev, newMessage]);
        }
      } else {
        // Normal completion - finalize the current message if it exists
        if (currentMessageIdRef.current) {
          console.log("Finalizing current message:", currentMessageIdRef.current);
          setMessages(prev => prev.map(msg =>
            msg.id === currentMessageIdRef.current
              ? { ...msg, content: data.fullText }
              : msg
          ));
        } else {
          // If we don't have a current message, create one from the completion
          console.log("Creating new message from completion (no current message)");
          const newMessage: Message = {
            id: `msg_${Date.now()}_assistant`,
            role: "assistant",
            content: data.fullText,
            createdAt: new Date(),
          };
          setMessages(prev => [...prev, newMessage]);
        }
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

    const handleStatus = (data: { status?: string }) => {
      if (data.status) {
        setConnectionStatus(data.status);
      }
    };

    const handleHistoryResponse = (data: { messages?: any[] }) => {
      console.log("handleHistoryResponse called with:", data);
      if (data.messages && Array.isArray(data.messages)) {
        console.log("Converting messages:", data.messages);
        // Convert server messages to Message format
        const serverMessages: Message[] = data.messages.map((msg, index) => ({
          id: msg.id || `server_msg_${index}`,
          role: msg.role || "assistant",
          content: msg.content || msg.text || "",
          createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
        }));
        console.log("Setting messages to:", serverMessages);
        console.log("First message structure:", serverMessages[0]);
        console.log("Messages state will be updated to:", serverMessages.length, "messages");
        setMessages(serverMessages);
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