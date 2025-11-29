"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Chat } from "@/components/ui/chat";
import type { Message } from "@/components/ui/chat-message";
import { useConvId } from "@/lib/conv-id";
import { useWSConnection } from "@/lib/ws/ws-connection-manager";
import { activeTabManager } from "@/lib/ws/active-tab-manager";
import {
  AlertCircle,
  Loader2
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";

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

  // Track tool invocations for the current assistant message
  const currentToolInvocationsRef = useRef<Map<string, any>>(new Map());

  // Create a stable component reference for tab management
  const componentRef = useRef({});

  // Track thinking indicator start time
  const thinkingStartTimeRef = useRef<number | null>(null);

  // Track if we're currently submitting to prevent double submissions
  const isSubmittingRef = useRef(false);

  // Update thinking indicator seconds every second
  useEffect(() => {
    // Only set interval if thinking indicator exists
    const hasThinking = messages.some(m => m.isThinking);

    if (!hasThinking || thinkingStartTimeRef.current === null) {
      return;
    }

    const intervalId = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - thinkingStartTimeRef.current!) / 1000);

      setMessages(prev => {
        const thinkingIndex = prev.findIndex(m => m.isThinking);
        if (thinkingIndex === -1) return prev;

        const updated = [...prev];
        updated[thinkingIndex] = {
          ...updated[thinkingIndex],
          content: `Thinking... ${elapsedSeconds}s`
        };
        return updated;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [messages.some(m => m.isThinking), thinkingStartTimeRef.current]);

  // Debug: Track messages state changes
  useEffect(() => {
    console.log(`[State-Effect] Messages state changed:`, {
      count: messages.length,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        contentLength: m.content.length,
        contentPreview: m.content.substring(0, 50),
        completionTime: m.completionTime,
        isThinking: m.isThinking
      }))
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

    const handleLLMChunk = (data: { chunk: string; messageId?: string; sequence?: number; isAccumulated?: boolean; elapsedTime?: number }) => {
      // Only active tab processes chunks
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("ShadcnChatInterface: handleLLMChunk called with:", data);

      // Don't process empty chunks
      if (!data.chunk || data.chunk.trim() === '') {
        console.log("Skipping empty chunk");
        return;
      }

      const messageId = data.messageId || `msg_${Date.now()}_assistant`;

      // If we have a currentMessageIdRef and this chunk is for a different message, ignore it
      // This prevents processing chunks from aborted requests
      if (currentMessageIdRef.current && currentMessageIdRef.current !== messageId && !data.isAccumulated) {
        console.log(`[Chunk] Ignoring chunk from old message ${messageId}, current is ${currentMessageIdRef.current}`);
        return;
      }

      // Set the current message ID if not set (for first chunk)
      if (!currentMessageIdRef.current && !data.isAccumulated) {
        currentMessageIdRef.current = messageId;
        console.log(`[Chunk] Set current message ID to ${messageId}`);
      }

      // Set loading state when chunks arrive (for thinking indicator)
      if (!isLoading && !data.isAccumulated) {
        setIsLoading(true);
      }

      flushSync(() => {
        setMessages(prevMessages => {
          // Separate thinking indicator from other messages
          const thinkingMsg = prevMessages.find(m => m.isThinking);
          const otherMessages = prevMessages.filter(m => !m.isThinking);

          console.log(`[Chunk] Found thinking indicator: ${!!thinkingMsg}`);
          console.log(`[State] Other messages count: ${otherMessages.length}, isAccumulated: ${data.isAccumulated}`);

        const prev = otherMessages;

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
            const toolInvocations = currentToolInvocationsRef.current.size > 0
              ? Array.from(currentToolInvocationsRef.current.values())
              : undefined;
            const updatedMessages = prev.map((msg, idx) =>
              idx === existingIndex
                ? { ...msg, id: messageId, content: data.chunk, ...(toolInvocations && { toolInvocations }) }
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
            const toolInvocations = currentToolInvocationsRef.current.size > 0
              ? Array.from(currentToolInvocationsRef.current.values())
              : undefined;
            const newMessage: Message = {
              id: messageId,
              role: "assistant",
              content: data.chunk,
              createdAt: new Date(),
              ...(toolInvocations && { toolInvocations }),
            };

            // Store in refs for completion handler
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = data.chunk;

            console.log(`[Chunk-Accumulated] Returning ${prev.length + 1} messages (added new)`);
            const resultArray = [...prev, newMessage];
            return thinkingMsg ? [...resultArray, thinkingMsg] : resultArray;
          }
        } else {
          // Real-time chunk - check if message already exists in array
          const existingIndex = prev.findIndex(m => m.id === messageId);
          console.log(`[Chunk] Searching for message ${messageId}, found at index: ${existingIndex}, prev.length: ${prev.length}`);

          if (existingIndex === -1) {
            // Create new message
            console.log(`[Chunk] Creating new message: ${messageId} with chunk "${data.chunk.substring(0, 20)}..."`);
            const toolInvocations = currentToolInvocationsRef.current.size > 0
              ? Array.from(currentToolInvocationsRef.current.values())
              : undefined;
            const newMessage: Message = {
              id: messageId,
              role: "assistant",
              content: data.chunk,
              createdAt: new Date(),
              ...(toolInvocations && { toolInvocations }),
            };

            // Store in refs
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = data.chunk;

            const newArray = [...prev, newMessage];
            console.log(`[Chunk] Returning new array with ${newArray.length} messages`);
            return thinkingMsg ? [...newArray, thinkingMsg] : newArray;
          } else {
            // Append to existing message
            const existingMessage = prev[existingIndex];
            console.log(`[Chunk] Found existing message at index ${existingIndex}, current content length: ${existingMessage.content.length}`);
            const newContent = existingMessage.content + data.chunk;

            // Update refs
            currentMessageIdRef.current = messageId;
            currentMessageRef.current = newContent;

            console.log(`[Chunk] Appending "${data.chunk.substring(0, 20)}..." (chunk size: ${data.chunk.length}) -> total: ${newContent.length} chars`);

            // Preserve existing toolInvocations or add new ones
            const toolInvocations = currentToolInvocationsRef.current.size > 0
              ? Array.from(currentToolInvocationsRef.current.values())
              : existingMessage.toolInvocations;

            console.log(`[Chunk] currentToolInvocationsRef size: ${currentToolInvocationsRef.current.size}`);
            console.log(`[Chunk] existingMessage.toolInvocations:`, existingMessage.toolInvocations);
            console.log(`[Chunk] Final toolInvocations to use:`, toolInvocations);

            const updatedArray = prev.map((msg, idx) => {
              if (idx === existingIndex) {
                const updatedMsg = { ...msg, content: newContent };
                // Always preserve toolInvocations if they exist
                if (toolInvocations && toolInvocations.length > 0) {
                  updatedMsg.toolInvocations = toolInvocations;
                }
                console.log(`[Chunk] Updated message has toolInvocations:`, updatedMsg.toolInvocations?.length || 0);
                console.log(`[Chunk] Updated message object:`, updatedMsg);
                return updatedMsg;
              }
              return msg;
            });
            console.log(`[Chunk] Returning updated array with ${updatedArray.length} messages`);
            // Add thinking indicator back at the end if it exists
            return thinkingMsg ? [...updatedArray, thinkingMsg] : updatedArray;
          }
        }
        });
      });

      // Add logging to verify state update completed
      console.log(`[State] setMessages completed for ${messageId}`);
    };

    const handleLLMComplete = (data: { fullText: string; messageId: string; isAccumulated?: boolean; completionTime?: number }) => {
      // Only active tab processes completion
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("ShadcnChatInterface: handleLLMComplete called with:", {
        messageId: data.messageId,
        contentLength: data.fullText.length,
        isAccumulated: data.isAccumulated,
        completionTime: data.completionTime
      });

      // Clear thinking start time to stop interval
      thinkingStartTimeRef.current = null;

      // Use completion time from backend
      const completionTimeSeconds = data.completionTime ?? 0;
      console.log(`[Complete] Completion time from backend: ${completionTimeSeconds}s`);

      // Don't process empty completions
      const fullText = data.fullText || '';
      if (!fullText) {
        console.log("Skipping empty completion");
        currentMessageRef.current = null;
        currentMessageIdRef.current = null;
        setIsLoading(false);
        return;
      }

      setMessages(prevMessages => {
        // Remove thinking indicator when completion arrives
        const prev = prevMessages.filter(m => !m.isThinking);
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
            console.log(`[Complete] Adding completionTime: ${completionTimeSeconds}s to message ${data.messageId}`);
            // Still add completion time metadata
            const updated = prev.map((msg, idx) =>
              idx === messageIndex
                ? { ...msg, completionTime: completionTimeSeconds }
                : msg
            );
            console.log(`[Complete] Updated message:`, updated[messageIndex]);
            console.log(`[Complete] Updated message completionTime:`, updated[messageIndex].completionTime);
            return updated;
          }

          // Use fullText only for accumulated messages on reconnect
          console.log(`[Complete] Using fullText for ${data.isAccumulated ? 'accumulated' : 'empty'} message`);
          return prev.map((msg, idx) =>
            idx === messageIndex
              ? { ...msg, content: fullText, completionTime: completionTimeSeconds }
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
          completionTime: completionTimeSeconds,
        };
        return [...prev, newMessage];
      });

      // Clear refs after completion
      currentMessageRef.current = null;
      currentMessageIdRef.current = null;
      currentToolInvocationsRef.current.clear(); // Clear tool invocations for next message
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

      setMessages(prev => {
        // Remove thinking indicator and add error message
        const withoutThinking = prev.filter(m => !m.isThinking);
        return [...withoutThinking, errorMessage];
      });
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

        // Convert and merge messages
        const serverMessages: Message[] = [];
        let i = 0;

        while (i < data.messages.length) {
          const msg = data.messages[i];

          // Skip tool messages (they're internal)
          if (msg.role === 'tool') {
            console.log(`[History] Skipping tool message at index ${i}`);
            i++;
            continue;
          }

          // For user messages, just add them
          if (msg.role === 'user') {
            const messageId = msg.id || `history_${Date.now()}_${i}`;
            serverMessages.push({
              id: messageId,
              role: "user",
              content: msg.content || "",
              createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
            });
            console.log(`[History] Added user message at index ${i}`);
            i++;
            continue;
          }

          // For assistant messages, look ahead to merge content and tool_calls
          if (msg.role === 'assistant') {
            let mergedContent = msg.content || "";
            let toolInvocations: any[] = [];
            const messageId = msg.id || `history_${Date.now()}_${i}`;

            // Check if this message has tool_calls
            if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
              console.log(`[History] Message ${i} has tool_calls:`, msg.tool_calls);
              toolInvocations = msg.tool_calls.map((tc: any) => {
                let args = {};
                try {
                  const argStr = tc.function?.arguments || tc.arguments;
                  args = typeof argStr === 'string' ? JSON.parse(argStr) : (argStr || {});
                } catch (e) {
                  console.warn('[History] Failed to parse tool arguments:', e);
                }
                return {
                  state: "result",
                  toolCallId: tc.id,
                  toolName: tc.function?.name || tc.name,
                  args,
                };
              });
            }

            // Look ahead - if next message is assistant with tool_calls, merge it
            if (i + 1 < data.messages.length) {
              const nextMsg = data.messages[i + 1];
              if (nextMsg.role === 'assistant' && nextMsg.tool_calls && (!nextMsg.content || nextMsg.content.trim() === '')) {
                console.log(`[History] Merging tool_calls from message ${i + 1}`);
                const nextToolInvocations = nextMsg.tool_calls.map((tc: any) => {
                  let args = {};
                  try {
                    const argStr = tc.function?.arguments || tc.arguments;
                    args = typeof argStr === 'string' ? JSON.parse(argStr) : (argStr || {});
                  } catch (e) {
                    console.warn('[History] Failed to parse tool arguments:', e);
                  }
                  return {
                    state: "result",
                    toolCallId: tc.id,
                    toolName: tc.function?.name || tc.name,
                    args,
                  };
                });
                toolInvocations = [...toolInvocations, ...nextToolInvocations];
                i++; // Skip the next message since we merged it
              }
            }

            // Skip tool result message if it follows
            if (i + 1 < data.messages.length && data.messages[i + 1].role === 'tool') {
              i++; // Skip tool message
            }

            // Look ahead - if next message is assistant with content, merge it
            let finalCompletionTime = msg.completionTime;
            if (i + 1 < data.messages.length) {
              const nextMsg = data.messages[i + 1];
              if (nextMsg.role === 'assistant' && nextMsg.content && !nextMsg.tool_calls) {
                console.log(`[History] Merging content from message ${i + 1}`);
                mergedContent += nextMsg.content;
                // Use completion time from the merged message if available
                if (nextMsg.completionTime !== undefined) {
                  finalCompletionTime = nextMsg.completionTime;
                }
                i++; // Skip the next message since we merged it
              }
            }

            // Only add if there's content or tool invocations
            if (mergedContent.trim().length > 0 || toolInvocations.length > 0) {
              const message: Message = {
                id: messageId,
                role: "assistant",
                content: mergedContent,
                createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                ...(finalCompletionTime !== undefined && { completionTime: finalCompletionTime }),
                ...(msg.aborted && { aborted: true }),
              };

              if (toolInvocations.length > 0) {
                message.toolInvocations = toolInvocations;
                console.log(`[History] Added assistant message with ${toolInvocations.length} tool invocations`);
              } else {
                console.log(`[History] Added assistant message with content only`);
              }

              serverMessages.push(message);
            }

            i++;
            continue;
          }

          // Default: skip unknown message types
          i++;
        }

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

    const handleToolCall = (data: { toolCallId: string; toolName: string; args: any; status: string; assistantMessageId?: string }) => {
      // Only active tab processes tool calls
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("[Tool Call] Received:", data);
      console.log("[Tool Call] Assistant message ID from backend:", data.assistantMessageId);

      // Store tool invocation in "call" state
      currentToolInvocationsRef.current.set(data.toolCallId, {
        state: "call",
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        args: data.args,
      });
      console.log("[Tool Call] Current tool invocations size:", currentToolInvocationsRef.current.size);

      // Update or create assistant message to include tool invocations
      setMessages(prev => {
        const toolInvocations = Array.from(currentToolInvocationsRef.current.values());
        console.log("[Tool Call] Tool invocations array:", toolInvocations);

        // Separate thinking indicator from other messages
        const thinkingMsg = prev.find(m => m.isThinking);
        const otherMessages = prev.filter(m => !m.isThinking);

        // Look for message with matching ID if provided
        if (data.assistantMessageId) {
          const existingIndex = otherMessages.findIndex(m => m.id === data.assistantMessageId);
          console.log("[Tool Call] Looking for message with ID:", data.assistantMessageId, "found at index:", existingIndex);

          if (existingIndex !== -1) {
            // Update existing message
            console.log("[Tool Call] Updating existing message at index:", existingIndex);
            const updated = otherMessages.map((msg, idx) =>
              idx === existingIndex
                ? { ...msg, toolInvocations }
                : msg
            );
            return thinkingMsg ? [...updated, thinkingMsg] : updated;
          }
        }

        // Check if last non-thinking message is assistant
        const lastMsg = otherMessages[otherMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          console.log("[Tool Call] Updating last assistant message:", lastMsg.id);
          const updated = otherMessages.map((msg, idx) =>
            idx === otherMessages.length - 1
              ? { ...msg, toolInvocations }
              : msg
          );
          return thinkingMsg ? [...updated, thinkingMsg] : updated;
        }

        // Otherwise, create a placeholder assistant message using the ID from backend
        const messageId = data.assistantMessageId || currentMessageIdRef.current || `msg_${Date.now()}_assistant`;
        currentMessageIdRef.current = messageId;
        console.log("[Tool Call] Creating new message with ID:", messageId);
        const newMessage = {
          id: messageId,
          role: "assistant" as const,
          content: "",
          createdAt: new Date(),
          toolInvocations,
        };
        const updated = [...otherMessages, newMessage];
        return thinkingMsg ? [...updated, thinkingMsg] : updated;
      });
    };

    const handleToolResult = (data: { toolCallId: string; toolName: string; result: any }) => {
      // Only active tab processes tool results
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("[Tool Result] Received:", data);

      // Update tool invocation to "result" state
      const existingInvocation = currentToolInvocationsRef.current.get(data.toolCallId);
      if (existingInvocation) {
        currentToolInvocationsRef.current.set(data.toolCallId, {
          ...existingInvocation,
          state: "result",
          result: data.result,
        });

        // Update the current assistant message
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            const toolInvocations = Array.from(currentToolInvocationsRef.current.values());
            return prev.map((msg, idx) =>
              idx === prev.length - 1
                ? { ...msg, toolInvocations }
                : msg
            );
          }
          return prev;
        });
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
    wsClient.on("tool_call", handleToolCall);
    wsClient.on("tool_result", handleToolResult);

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
      wsClient.off("tool_call", handleToolCall);
      wsClient.off("tool_result", handleToolResult);
    };
  }, [wsClient, convId]); // Include wsClient and convId in dependencies

  const handleSubmit = useCallback(async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();

    console.log('[Submit] Called with input:', input?.substring(0, 50), 'isConnected:', wsClient?.isConnected());

    if (!input.trim() || !wsClient?.isConnected()) {
      console.log('[Submit] Skipping - no input or not connected');
      return;
    }

    // Prevent double submissions
    if (isSubmittingRef.current) {
      console.log('[Submit] Already submitting, ignoring duplicate submission');
      return;
    }

    // Mark as submitting
    isSubmittingRef.current = true;
    console.log('[Submit] Marked as submitting');

    // If already loading, abort the previous request first
    if (isLoading) {
      console.log('[Submit] Aborting previous request before sending new message');

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
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isThinking);
        if (abortedMessageId) {
          return filtered.map(m =>
            m.id === abortedMessageId ? { ...m, aborted: true } : m
          );
        }
        return filtered;
      });

      // Send abort to backend
      wsClient.abort();

      // Wait longer for abort to fully process on backend before sending new message
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
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

    setMessages(prev => [...prev, userMessage, thinkingMessage]);
    const messageText = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Submit] Sending message to backend:', messageText.substring(0, 50));
      await wsClient.sendMessage(messageText);
      console.log('[Submit] Message sent successfully');
    } catch (error) {
      console.log('[Submit] Error sending message:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error.message : "Failed to send message");

      // Remove both the user message and thinking indicator if send failed
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id && msg.id !== thinkingMessage.id));
    } finally {
      // Reset submitting flag after a short delay to allow state updates to complete
      setTimeout(() => {
        console.log('[Submit] Clearing submitting flag');
        isSubmittingRef.current = false;
      }, 100);
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
    console.log('[Abort] User manually aborted request');
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
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isThinking);
      // Mark the aborted message
      if (abortedMessageId) {
        return filtered.map(m =>
          m.id === abortedMessageId ? { ...m, aborted: true } : m
        );
      }
      return filtered;
    });
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