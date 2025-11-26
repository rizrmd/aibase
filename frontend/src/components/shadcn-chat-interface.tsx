"use client";

import { useState, useCallback, useRef, useEffect, ChangeEvent } from "react";
import { Chat } from "@/components/ui/chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WSClient } from "@/lib/ws/ws-client";
import type { Message } from "@/components/ui/chat-message";
import {
  Square,
  Trash2,
  Wifi,
  WifiOff,
  AlertCircle,
} from "lucide-react";

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
  const wsClientRef = useRef<WSClient | null>(null);

  const currentMessageRef = useRef<string | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // Initialize WebSocket client
  useEffect(() => {
    const wsClient = new WSClient({
      url: wsUrl,
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

    const handleLLMChunk = (data: { chunk: string; sequence?: number }) => {
      // If we have a current message being built, append to it
      if (currentMessageRef.current && currentMessageIdRef.current) {
        currentMessageRef.current += data.chunk;

        setMessages(prev => prev.map(msg =>
          msg.id === currentMessageIdRef.current
            ? { ...msg, content: currentMessageRef.current! }
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
      if (data.status) {
        setConnectionStatus(data.status);
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

    // Connect to WebSocket
    wsClient.connect().catch(handleError);

    // Cleanup function
    return () => {
      wsClient.disconnect();
    };
  }, [wsUrl]);

  const handleSubmit = useCallback(async (e?: { preventDefault?: () => void }, options?: { experimental_attachments?: FileList }) => {
    e?.preventDefault?.();

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
    const messageText = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      await wsClientRef.current!.sendMessage(messageText);
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : "Failed to send message");

      // Remove the user message if send failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    }
  }, [input]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

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

  const isConnected = wsClientRef.current?.isConnected() ?? false;

  return (
    <div className={`flex flex-col h-screen ${className}`}>
      {/* Header */}
      <div className="m-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">AI Assistant</h1>
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
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="mx-4 mb-2 border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* shadcn-chatbot-kit Chat Component */}
      <div className="flex-1 px-4 pb-4 min-h-0">
        <div className="h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex flex-col">
          <div className="flex-1">
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
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2 justify-end">
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
  );
}