import { useEffect } from "react";
import { flushSync } from "react-dom";
import type { Message } from "@/components/ui/chat";
import { activeTabManager } from "@/lib/ws/active-tab-manager";
import type { WSClient } from "@/lib/ws/ws-connection-manager";
import { useConversationStore } from "@/stores/conversation-store";
import { useProjectStore } from "@/stores/project-store";

interface UseWebSocketHandlersProps {
  wsClient: WSClient | null;
  convId: string;
  componentRef: React.MutableRefObject<{}>;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setIsLoading: (loading: boolean) => void;
  setIsHistoryLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTodos: (todos: any) => void;
  setMaxTokens: (maxTokens: number | null) => void;
  setTokenUsage: (tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number; messageCount: number } | null) => void;
  isLoading: boolean;
  thinkingStartTimeRef: React.MutableRefObject<number | null>;
  currentMessageRef: React.MutableRefObject<string | null>;
  currentMessageIdRef: React.MutableRefObject<string | null>;
  currentToolInvocationsRef: React.MutableRefObject<Map<string, any>>;
  currentPartsRef: React.MutableRefObject<any[]>;
}

export function useWebSocketHandlers({
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
}: UseWebSocketHandlersProps) {
  // Get conversation store and project store for title updates
  const { refreshConversations } = useConversationStore();
  const { currentProject } = useProjectStore();

  useEffect(() => {
    if (!wsClient) return;

    console.log("[Setup] Registering event handlers for convId:", convId);

    // Register this tab as active for this conversation
    activeTabManager.registerTab(componentRef.current, convId);

    // Set up event handlers
    const handleConnected = () => {
      // Only active tab handles connection events
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      setError(null);
      // Set history loading state to true when requesting history
      setIsHistoryLoading(true);
      // Request message history from server when connected
      wsClient.getHistory();
    };

    const handleDisconnected = () => {
      setIsLoading(false);
    };

    const handleReconnecting = () => {
      // Reconnecting state
    };

    const handleError = (error: Error) => {
      setError(error.message);
      setIsLoading(false);
    };

    const handleLLMChunk = (data: {
      chunk: string;
      messageId?: string;
      sequence?: number;
      isAccumulated?: boolean;
      startTime?: number;
    }) => {
      // Only active tab processes chunks
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("handleLLMChunk called with:", data);

      // Store start time from server in ref for interval calculation
      if (data.startTime && thinkingStartTimeRef.current === null) {
        thinkingStartTimeRef.current = data.startTime;
        console.log("[ThinkingTime] Stored startTime from server:", data.startTime);
      }

      // Don't process null/undefined chunks, but DO process empty string and whitespace chunks
      // Empty accumulated chunks are sent to provide startTime for thinking indicator
      if (data.chunk === null || data.chunk === undefined) {
        console.log("Skipping null/undefined chunk");
        return;
      }

      const messageId = data.messageId || `msg_${Date.now()}_assistant`;

      // If we have a currentMessageIdRef and this chunk is for a different message, ignore it
      // This prevents processing chunks from aborted requests
      if (
        currentMessageIdRef.current &&
        currentMessageIdRef.current !== messageId &&
        !data.isAccumulated
      ) {
        console.log(
          `[Chunk] Ignoring chunk from old message ${messageId}, current is ${currentMessageIdRef.current}`
        );
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
        setMessages((prevMessages) => {
          // Separate thinking indicator from other messages
          let thinkingMsg = prevMessages.find((m) => m.isThinking);
          const otherMessages = prevMessages.filter((m) => !m.isThinking);

          // If we don't have a thinking indicator yet, create one
          // This happens after page refresh when streaming is still active
          if (!thinkingMsg) {
            console.log("[Chunk] Creating thinking indicator (no existing one found)");
            thinkingMsg = {
              id: `thinking_${Date.now()}`,
              role: "assistant",
              content: "Thinking...",
              createdAt: new Date(),
              isThinking: true,
            };
          }

          console.log(`[Chunk] Found/Created thinking indicator: ${!!thinkingMsg}`);
          if (thinkingMsg) {
            console.log(`[Chunk] Thinking message:`, thinkingMsg);
          }
          console.log(`[Chunk] Total prevMessages: ${prevMessages.length}, otherMessages: ${otherMessages.length}, isAccumulated: ${data.isAccumulated}`);

          const prev = otherMessages;

          if (data.isAccumulated) {
            // Accumulated chunks on reconnect
            console.log(
              `[Chunk-Accumulated] Received ${data.chunk.length} chars for message ${messageId}`
            );

            // First, try to find message by ID
            let existingIndex = prev.findIndex((m) => m.id === messageId);

            // If not found by ID, look for the last empty assistant message (from history)
            if (existingIndex === -1) {
              console.log(
                `[Chunk-Accumulated] Message ID ${messageId} not found, looking for empty assistant message`
              );
              existingIndex = prev.findIndex(
                (m) =>
                  m.role === "assistant" &&
                  (!m.content || m.content.trim() === "")
              );
              if (existingIndex !== -1) {
                console.log(
                  `[Chunk-Accumulated] Found empty assistant message at index ${existingIndex}, will update it and change ID to ${messageId}`
                );
              }
            }

            console.log(
              `[Chunk-Accumulated] Final message index: ${existingIndex}`
            );

            if (existingIndex !== -1) {
              // Update existing message with accumulated content and correct ID
              console.log(
                `[Chunk-Accumulated] Updating message at index ${existingIndex} with content length ${data.chunk.length}`
              );
              const toolInvocations =
                currentToolInvocationsRef.current.size > 0
                  ? Array.from(currentToolInvocationsRef.current.values())
                  : undefined;
              const updatedMessages = prev.map((msg, idx) =>
                idx === existingIndex
                  ? {
                      ...msg,
                      id: messageId,
                      content: data.chunk,
                      ...(toolInvocations && { toolInvocations }),
                    }
                  : msg
              );

              // Store in refs for completion handler
              currentMessageIdRef.current = messageId;
              currentMessageRef.current = data.chunk;

              console.log(
                `[Chunk-Accumulated] Returning ${updatedMessages.length} messages`
              );
              // FIX: Only add thinking indicator if one doesn't already exist in the result
              // This prevents duplicates when multiple setMessages calls race
              const hasThinkingIndicator = updatedMessages.some((m) => "isThinking" in m && m.isThinking);
              return !hasThinkingIndicator && thinkingMsg
                ? [...updatedMessages, thinkingMsg]
                : updatedMessages;
            } else {
              // Create new message with accumulated content
              console.log(
                `[Chunk-Accumulated] Creating new message ${messageId} with accumulated content (${data.chunk.length} chars)`
              );
              const toolInvocations =
                currentToolInvocationsRef.current.size > 0
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

              console.log(
                `[Chunk-Accumulated] Returning ${
                  prev.length + 1
                } messages (added new)`
              );
              const resultArray = [...prev, newMessage];
              // FIX: Only add thinking indicator if one doesn't already exist in the result
              const hasThinkingIndicator = resultArray.some((m) => "isThinking" in m && m.isThinking);
              return !hasThinkingIndicator && thinkingMsg
                ? [...resultArray, thinkingMsg]
                : resultArray;
            }
          } else {
            // Real-time chunk - check if message already exists in array
            const existingIndex = prev.findIndex((m) => m.id === messageId);
            console.log(
              `[Chunk] Searching for message ${messageId}, found at index: ${existingIndex}, prev.length: ${prev.length}`
            );

            if (existingIndex === -1) {
              // Create new message
              console.log(
                `[Chunk] Creating new message: ${messageId} with chunk "${data.chunk.substring(
                  0,
                  20
                )}..."`
              );

              // Add chunk to parts array in arrival order (create new array for React)
              const lastPart = currentPartsRef.current[currentPartsRef.current.length - 1];
              if (lastPart && lastPart.type === "text") {
                // Append to existing text part - create new array with updated part
                currentPartsRef.current = [
                  ...currentPartsRef.current.slice(0, -1),
                  { ...lastPart, text: lastPart.text + data.chunk }
                ];
              } else {
                // Create new text part - create new array
                currentPartsRef.current = [
                  ...currentPartsRef.current,
                  {
                    type: "text",
                    text: data.chunk,
                  }
                ];
              }

              const toolInvocations =
                currentToolInvocationsRef.current.size > 0
                  ? Array.from(currentToolInvocationsRef.current.values())
                  : undefined;

              const parts = currentPartsRef.current.length > 0
                ? [...currentPartsRef.current]
                : undefined;

              const newMessage: Message = {
                id: messageId,
                role: "assistant",
                content: data.chunk,
                createdAt: new Date(),
                ...(toolInvocations && { toolInvocations }),
                ...(parts && { parts }),
              };

              // Store in refs
              currentMessageIdRef.current = messageId;
              currentMessageRef.current = data.chunk;

              const newArray = [...prev, newMessage];
              console.log(
                `[Chunk] Returning new array with ${newArray.length} messages`
              );
              // FIX: Only add thinking indicator if one doesn't already exist in the result
              const hasThinkingIndicator = newArray.some((m) => "isThinking" in m && m.isThinking);
              const finalArray = !hasThinkingIndicator && thinkingMsg
                ? [...newArray, thinkingMsg]
                : newArray;
              console.log(`[Chunk] Final array has ${finalArray.length} messages (with thinking: ${!!thinkingMsg})`);
              return finalArray;
            } else {
              // Append to existing message
              const existingMessage = prev[existingIndex];
              console.log(
                `[Chunk] Found existing message at index ${existingIndex}, current content length: ${existingMessage.content.length}`
              );
              const newContent = existingMessage.content + data.chunk;

              // Add chunk to parts array in arrival order (create new array for React)
              const lastPart = currentPartsRef.current[currentPartsRef.current.length - 1];
              if (lastPart && lastPart.type === "text") {
                // Append to existing text part - create new array with updated part
                currentPartsRef.current = [
                  ...currentPartsRef.current.slice(0, -1),
                  { ...lastPart, text: lastPart.text + data.chunk }
                ];
              } else {
                // Create new text part - create new array
                currentPartsRef.current = [
                  ...currentPartsRef.current,
                  {
                    type: "text",
                    text: data.chunk,
                  }
                ];
              }

              // Update refs
              currentMessageIdRef.current = messageId;
              currentMessageRef.current = newContent;

              console.log(
                `[Chunk] Appending "${data.chunk.substring(
                  0,
                  20
                )}..." (chunk size: ${data.chunk.length}) -> total: ${
                  newContent.length
                } chars`
              );

              // Preserve existing toolInvocations or add new ones
              const toolInvocations =
                currentToolInvocationsRef.current.size > 0
                  ? Array.from(currentToolInvocationsRef.current.values())
                  : existingMessage.toolInvocations;

              console.log(
                `[Chunk] currentToolInvocationsRef size: ${currentToolInvocationsRef.current.size}`
              );
              console.log(
                `[Chunk] existingMessage.toolInvocations:`,
                existingMessage.toolInvocations
              );
              console.log(
                `[Chunk] Final toolInvocations to use:`,
                toolInvocations
              );

              // Use parts array to preserve streaming arrival order
              const parts = currentPartsRef.current.length > 0
                ? [...currentPartsRef.current]
                : existingMessage.parts;

              const updatedArray = prev.map((msg, idx) => {
                if (idx === existingIndex) {
                  const updatedMsg = { ...msg, content: newContent };
                  // Always preserve toolInvocations if they exist
                  if (toolInvocations && toolInvocations.length > 0) {
                    updatedMsg.toolInvocations = toolInvocations;
                  }
                  // Add parts to preserve arrival order
                  if (parts) {
                    updatedMsg.parts = parts;
                  }
                  console.log(
                    `[Chunk] Updated message has toolInvocations:`,
                    updatedMsg.toolInvocations?.length || 0
                  );
                  console.log(
                    `[Chunk] Updated message has parts:`,
                    updatedMsg.parts?.length || 0
                  );
                  console.log(`[Chunk] Updated message object:`, updatedMsg);
                  return updatedMsg;
                }
                return msg;
              });
              console.log(
                `[Chunk] Returning updated array with ${updatedArray.length} messages`
              );
              // FIX: Only add thinking indicator if one doesn't already exist in the result
              const hasThinkingIndicator = updatedArray.some((m) => "isThinking" in m && m.isThinking);
              return !hasThinkingIndicator && thinkingMsg
                ? [...updatedArray, thinkingMsg]
                : updatedArray;
            }
          }
        });
      });

      // Add logging to verify state update completed
      console.log(`[State] setMessages completed for ${messageId}`);
    };

    const handleLLMComplete = (data: {
      fullText: string;
      messageId: string;
      isAccumulated?: boolean;
      completionTime?: number;
      thinkingDuration?: number;
      tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        messageCount: number;
      };
      maxTokens?: number;
    }) => {
      // Only active tab processes completion
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("handleLLMComplete called with:", {
        messageId: data.messageId,
        contentLength: data.fullText.length,
        isAccumulated: data.isAccumulated,
        completionTime: data.completionTime,
        thinkingDuration: data.thinkingDuration,
        tokenUsage: data.tokenUsage,
      });

      // Clear thinking start time to stop interval
      thinkingStartTimeRef.current = null;

      // Store maxTokens and tokenUsage if provided by backend
      if (data.maxTokens !== undefined) {
        setMaxTokens(data.maxTokens);
      }
      if (data.tokenUsage) {
        setTokenUsage(data.tokenUsage);
        console.log("[Complete] Updated tokenUsage from llm_complete:", data.tokenUsage);
      }

      // Use completion time from backend
      const completionTimeSeconds = data.completionTime ?? 0;
      console.log(
        `[Complete] Completion time from backend: ${completionTimeSeconds}s`
      );

      // Don't process empty completions
      const fullText = data.fullText || "";
      if (!fullText) {
        console.log("Skipping empty completion");
        currentMessageRef.current = null;
        currentMessageIdRef.current = null;
        setIsLoading(false);
        return;
      }

      // Use flushSync for consistency with handleLLMChunk and to prevent race conditions
      flushSync(() => {
        setMessages((prevMessages) => {
          console.log(
            `[Complete] Processing completion for message ${data.messageId} (${fullText.length} chars, accumulated: ${data.isAccumulated})`
          );

          // Find message to update in the full array (before removing thinking indicator)
          const messageIndex = prevMessages.findIndex((m) => m.id === data.messageId && !m.isThinking);

          if (messageIndex !== -1) {
            // Message already exists from streaming chunks
            const existingMessage = prevMessages[messageIndex];
            console.log(
              `[Complete] Message ${data.messageId} already exists with ${existingMessage.content.length} chars from streaming`
            );
            console.log(
              `[Complete] Backend fullText has ${fullText.length} chars`
            );

            // Use fullText from backend as authoritative source
            // If lengths don't match, there's a backend bug that needs to be fixed
            if (existingMessage.content.length !== fullText.length) {
              console.warn(
                `[Complete] WARNING: Streamed content (${existingMessage.content.length} chars) != backend fullText (${fullText.length} chars) - backend may have sent incomplete data`
              );
            }

            // Preserve existing toolInvocations first, then merge with any new ones
            const existingToolInvocations = existingMessage.toolInvocations || [];
            const newToolInvocations = currentToolInvocationsRef.current.size > 0
              ? Array.from(currentToolInvocationsRef.current.values())
              : [];

            // Merge: create a map of existing tools, update/add new ones
            const toolInvocationsMap = new Map();
            existingToolInvocations.forEach((inv: any) => {
              toolInvocationsMap.set(inv.toolCallId, inv);
            });
            newToolInvocations.forEach((inv: any) => {
              toolInvocationsMap.set(inv.toolCallId, inv);
            });

            const mergedToolInvocations = Array.from(toolInvocationsMap.values());

            // Update parts array: replace text part with fullText from backend
            // This ensures the message displays the complete text instead of streaming chunks
            let updatedParts = existingMessage.parts;
            if (existingMessage.parts && existingMessage.parts.length > 0) {
              // Check if there's a text part (should be the last one or first one)
              const textPartIndex = existingMessage.parts.findIndex(p => p.type === "text");
              if (textPartIndex !== -1) {
                // Update the text part with fullText from backend
                updatedParts = [...existingMessage.parts];
                const textPart = existingMessage.parts[textPartIndex];
                if (textPart.type === "text") {
                  updatedParts[textPartIndex] = {
                    ...textPart,
                    text: fullText,
                  };
                  console.log(
                    `[Complete] Updated text part at index ${textPartIndex} from ${textPart.text.length} chars to ${fullText.length} chars`
                  );
                }
              } else {
                // No text part found, add one at the beginning
                updatedParts = [
                  { type: "text", text: fullText },
                  ...existingMessage.parts,
                ];
                console.log(`[Complete] Added new text part with ${fullText.length} chars`);
              }
            }

            // Update message AND remove thinking indicator in one atomic render
            return prevMessages.map((msg, idx) => {
              if (idx === messageIndex) {
                return {
                  ...msg,
                  content: fullText,
                  ...(updatedParts && { parts: updatedParts }),
                  completionTime: completionTimeSeconds,
                  ...(data.thinkingDuration !== undefined && { thinkingDuration: data.thinkingDuration }),
                  ...(data.tokenUsage && { tokenUsage: data.tokenUsage }),
                  ...(mergedToolInvocations.length > 0 && { toolInvocations: mergedToolInvocations }),
                };
              }
              // Remove thinking indicator in the same render
              return msg.isThinking ? (undefined as any) : msg;
            }).filter(Boolean);
          }

          // Message not found - create one with fullText
          console.warn(
            `[Complete] Message ${data.messageId} not found, creating new message with fullText`
          );
          console.warn(
            `[Complete] Available message IDs in prevMessages:`,
            prevMessages.map((m) => m.id)
          );
          const toolInvocations =
            currentToolInvocationsRef.current.size > 0
              ? Array.from(currentToolInvocationsRef.current.values())
              : undefined;

          // Create parts array for new message
          // Start with text part, then add tool invocations if any
          let parts: any[] | undefined = [{ type: "text", text: fullText }];
          if (toolInvocations && toolInvocations.length > 0) {
            parts = [
              { type: "text", text: fullText },
              ...toolInvocations.map(inv => ({
                type: "tool-invocation",
                toolInvocation: inv,
              })),
            ];
          }

          const newMessage: Message = {
            id: data.messageId,
            role: "assistant",
            content: fullText,
            ...(parts && { parts }),
            createdAt: new Date(),
            completionTime: completionTimeSeconds,
            ...(data.thinkingDuration !== undefined && { thinkingDuration: data.thinkingDuration }),
            ...(data.tokenUsage && { tokenUsage: data.tokenUsage }),
            ...(toolInvocations && toolInvocations.length > 0 && { toolInvocations }),
          };
          // Add new message and remove thinking indicator in one atomic render
          return [...prevMessages.filter((m) => !m.isThinking), newMessage];
        });
      });

      // Clear refs after completion
      currentMessageRef.current = null;
      currentMessageIdRef.current = null;
      currentToolInvocationsRef.current.clear(); // Clear tool invocations for next message
      currentPartsRef.current = []; // Clear parts for next message
      setIsLoading(false);

      console.log("Completion handling complete");
    };

    const handleCommunicationError = (data: {
      code: string;
      message: string;
    }) => {
      setError(`Communication error: ${data.message}`);
      setIsLoading(false);

      // Add error message to chat
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: `Error: ${data.message}`,
        createdAt: new Date(),
      };

      setMessages((prev) => {
        // Remove thinking indicator and add error message
        const withoutThinking = prev.filter((m) => !m.isThinking);
        return [...withoutThinking, errorMessage];
      });
    };

    const handleStatus = (_data: { status?: string }) => {
      // Status update
    };

    const handleHistoryResponse = (data: { messages?: any[]; hasActiveStream?: boolean; maxTokens?: number; tokenUsage?: any }) => {
      console.log("handleHistoryResponse called with:", data);
      console.log("[History] hasActiveStream from backend:", data.hasActiveStream);
      console.log("[History] tokenUsage from backend:", data.tokenUsage);

      // Clear history loading state when response is received
      setIsHistoryLoading(false);

      // Set maxTokens if provided
      if (data.maxTokens !== undefined) {
        setMaxTokens(data.maxTokens);
        console.log("[History] Set maxTokens from history response:", data.maxTokens);
      }

      // Set tokenUsage if provided (from OpenAI API via info.json)
      if (data.tokenUsage) {
        setTokenUsage(data.tokenUsage);
        console.log("[History] Set tokenUsage from history response:", data.tokenUsage);
      }

      if (data.messages && Array.isArray(data.messages)) {
        console.log("Converting messages:", data.messages);

        // Convert and merge messages
        const serverMessages: Message[] = [];
        let i = 0;

        while (i < data.messages.length) {
          const msg = data.messages[i];

          // Skip tool messages (they're internal)
          if (msg.role === "tool") {
            console.log(`[History] Skipping tool message at index ${i}`);
            i++;
            continue;
          }

          // For user messages, just add them
          if (msg.role === "user") {
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
          if (msg.role === "assistant") {
            let mergedContent = msg.content || "";
            let toolInvocations: any[] = [];
            const messageId = msg.id || `history_${Date.now()}_${i}`;

            // Create a map of tool results by looking ahead (for all tool_calls in this message)
            const toolResultsMap = new Map<string, any>();
            for (let j = i + 1; j < data.messages.length; j++) {
              const futureMsg = data.messages[j];
              if (futureMsg.role === "tool" && futureMsg.tool_call_id) {
                try {
                  const resultContent = typeof futureMsg.content === "string"
                    ? JSON.parse(futureMsg.content)
                    : futureMsg.content;
                  console.log(`[History] Found tool result for ${futureMsg.tool_call_id}:`, resultContent);
                  toolResultsMap.set(futureMsg.tool_call_id, resultContent);
                } catch (e) {
                  // If not JSON, use as-is
                  console.log(`[History] Found tool result (non-JSON) for ${futureMsg.tool_call_id}:`, futureMsg.content);
                  toolResultsMap.set(futureMsg.tool_call_id, futureMsg.content);
                }
              } else if (futureMsg.role === "assistant" && !futureMsg.tool_calls) {
                // Stop when we hit the next assistant message WITHOUT tool_calls
                // (assistant messages with tool_calls are part of the same logical group)
                break;
              }
            }
            console.log(`[History] Tool results map size: ${toolResultsMap.size}`, Array.from(toolResultsMap.entries()));

            // Check if this message has tool_calls
            if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
              console.log(
                `[History] Message ${i} has tool_calls:`,
                msg.tool_calls
              );

              toolInvocations = msg.tool_calls.map((tc: any) => {
                let args = {};
                try {
                  const argStr = tc.function?.arguments || tc.arguments;
                  args =
                    typeof argStr === "string"
                      ? JSON.parse(argStr)
                      : argStr || {};
                } catch (e) {
                  console.warn("[History] Failed to parse tool arguments:", e);
                }

                const toolResult = toolResultsMap.get(tc.id);
                const hasError = toolResult && toolResult.error;

                console.log(`[History] Tool ${tc.id} (${tc.function?.name || tc.name}):`, {
                  hasResult: !!toolResult,
                  result: toolResult,
                  hasError,
                });

                return {
                  state: hasError ? "error" : "result",
                  toolCallId: tc.id,
                  toolName: tc.function?.name || tc.name,
                  args,
                  result: hasError ? undefined : toolResult,
                  error: hasError ? toolResult.error : undefined,
                };
              });
            }

            // Look ahead - if next message is assistant with tool_calls, merge it
            if (i + 1 < data.messages.length) {
              const nextMsg = data.messages[i + 1];
              if (
                nextMsg.role === "assistant" &&
                nextMsg.tool_calls &&
                (!nextMsg.content || nextMsg.content.trim() === "")
              ) {
                console.log(
                  `[History] Merging tool_calls from message ${i + 1}`
                );
                const nextToolInvocations = nextMsg.tool_calls.map(
                  (tc: any) => {
                    let args = {};
                    try {
                      const argStr = tc.function?.arguments || tc.arguments;
                      args =
                        typeof argStr === "string"
                          ? JSON.parse(argStr)
                          : argStr || {};
                    } catch (e) {
                      console.warn(
                        "[History] Failed to parse tool arguments:",
                        e
                      );
                    }

                    const toolResult = toolResultsMap.get(tc.id);
                    const hasError = toolResult && toolResult.error;

                    console.log(`[History] Merged tool ${tc.id} (${tc.function?.name || tc.name}):`, {
                      hasResult: !!toolResult,
                      result: toolResult,
                      hasError,
                    });

                    return {
                      state: hasError ? "error" : "result",
                      toolCallId: tc.id,
                      toolName: tc.function?.name || tc.name,
                      args,
                      result: hasError ? undefined : toolResult,
                      error: hasError ? toolResult.error : undefined,
                    };
                  }
                );
                toolInvocations = [...toolInvocations, ...nextToolInvocations];
                i++; // Skip the next message since we merged it
              }
            }

            // Skip tool result message if it follows
            if (
              i + 1 < data.messages.length &&
              data.messages[i + 1].role === "tool"
            ) {
              i++; // Skip tool message
            }

            // Build parts array to preserve order of text and tool invocations
            const parts: any[] = [];

            // Add initial content as text part if present
            if (mergedContent.trim()) {
              parts.push({
                type: "text",
                text: mergedContent,
              });
            }

            // Add tool invocations as parts
            if (toolInvocations.length > 0) {
              toolInvocations.forEach((inv) => {
                parts.push({
                  type: "tool-invocation",
                  toolInvocation: inv,
                });
              });
            }

            // Look ahead - if next message is assistant with content, add as another text part
            let finalCompletionTime = msg.completionTime;
            if (i + 1 < data.messages.length) {
              const nextMsg = data.messages[i + 1];
              if (
                nextMsg.role === "assistant" &&
                nextMsg.content &&
                !nextMsg.tool_calls
              ) {
                console.log(`[History] Adding content from message ${i + 1} as text part`);
                parts.push({
                  type: "text",
                  text: nextMsg.content,
                });
                // Use completion time from the merged message if available
                if (nextMsg.completionTime !== undefined) {
                  finalCompletionTime = nextMsg.completionTime;
                }
                i++; // Skip the next message since we included it
              }
            }

            // Only add if there are parts
            if (parts.length > 0) {
              const message: Message = {
                id: messageId,
                role: "assistant",
                content: mergedContent, // Keep for backwards compatibility
                parts: parts, // Use parts for proper ordering
                createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
                ...(finalCompletionTime !== undefined && {
                  completionTime: finalCompletionTime,
                }),
                ...(msg.thinkingDuration !== undefined && { thinkingDuration: msg.thinkingDuration }),
                ...(msg.aborted && { aborted: true }),
                ...(msg.tokenUsage && { tokenUsage: msg.tokenUsage }),
              };

              // Also keep toolInvocations for backwards compatibility
              if (toolInvocations.length > 0) {
                message.toolInvocations = toolInvocations;
                console.log(
                  `[History] Added assistant message with ${parts.length} parts (${toolInvocations.length} tool invocations), tokenUsage:`, msg.tokenUsage
                );
              } else {
                console.log(
                  `[History] Added assistant message with ${parts.length} parts (content only), tokenUsage:`, msg.tokenUsage
                );
              }

              console.log(`[History] Final message object:`, message);
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
        console.log(
          "Messages state will be updated to:",
          serverMessages.length,
          "messages"
        );

        // Check if the last message is an incomplete assistant message (still streaming)
        const lastMessage = serverMessages[serverMessages.length - 1];
        const isLastMessageIncomplete =
          lastMessage &&
          lastMessage.role === "assistant" &&
          !lastMessage.completionTime &&
          !lastMessage.aborted;

        // Backend tells us if there's an active stream (more reliable than checking last message)
        const shouldShowThinking = data.hasActiveStream || isLastMessageIncomplete;

        console.log("[History] Last message incomplete?", isLastMessageIncomplete, lastMessage);
        console.log("[History] shouldShowThinking?", shouldShowThinking, "(hasActiveStream:", data.hasActiveStream, "isLastMessageIncomplete:", isLastMessageIncomplete, ")");

        // IMPORTANT: Merge with current state instead of replacing it
        // This prevents history from overwriting streamed content
        setMessages((prev) => {
          // Check if there's an existing thinking indicator
          const existingThinkingIndicator = prev.find((m) => m.isThinking);
          console.log("[History] Merging - prev.length:", prev.length, "existingThinkingIndicator:", !!existingThinkingIndicator);
          console.log("[History] shouldShowThinking:", shouldShowThinking);

          // If we have no current messages, just use server messages
          if (prev.length === 0) {
            console.log(
              "[History] No existing messages, using server messages"
            );

            // Add thinking indicator if streaming is active
            if (shouldShowThinking) {
              console.log("[History] Adding thinking indicator for incomplete message");
              const thinkingMessage: Message = {
                id: `thinking_${Date.now()}`,
                role: "assistant",
                content: "Thinking...",
                createdAt: new Date(),
                isThinking: true,
              };
              return [...serverMessages, thinkingMessage];
            }

            return serverMessages;
          }

          // If we have messages, merge smartly
          console.log(
            `[History] Merging with ${prev.length} existing messages`
          );
          const merged = [...serverMessages];

          // For each existing message, check if it has MORE content than the server version
          // This handles the case where streaming accumulated more content than what's in history
          prev.forEach((existingMsg) => {
            // Skip thinking indicators - we'll handle them separately
            if (existingMsg.isThinking) {
              console.log("[History] Preserving thinking indicator from existing messages");
              return;
            }

            const serverMsgIndex = merged.findIndex(
              (m) => m.id === existingMsg.id
            );

            if (serverMsgIndex !== -1) {
              const serverMsg = merged[serverMsgIndex];
              // Keep the version with more content (streaming version beats history)
              if (existingMsg.content.length > serverMsg.content.length) {
                console.log(
                  `[History] Keeping streamed version of ${existingMsg.id} (${existingMsg.content.length} chars > ${serverMsg.content.length} chars from history)`
                );
                // Merge tokenUsage from server message into streamed message
                merged[serverMsgIndex] = {
                  ...existingMsg,
                  ...(serverMsg.tokenUsage && { tokenUsage: serverMsg.tokenUsage }),
                  ...(serverMsg.completionTime && !existingMsg.completionTime && { completionTime: serverMsg.completionTime }),
                };
                console.log(
                  `[History] Merged tokenUsage from server:`, serverMsg.tokenUsage
                );
              } else {
                console.log(
                  `[History] Using history version of ${existingMsg.id} (${serverMsg.content.length} chars >= ${existingMsg.content.length} chars from stream)`
                );
              }
            } else {
              // Message exists locally but not in history - this is stale data from previous session
              // Don't keep it, server history is the source of truth
              console.log(
                `[History] Message ${existingMsg.id} exists locally but not in history, discarding stale message`
              );
            }
          });

          // Add thinking indicator if:
          // 1. Backend says there's an active stream, OR
          // 2. Last message is incomplete (still streaming), OR
          // 3. We had a thinking indicator before history loaded (chunks arrived before history)
          if (shouldShowThinking || existingThinkingIndicator) {
            console.log("[History] Adding thinking indicator for incomplete message after merge (shouldShowThinking:", shouldShowThinking, "existing:", !!existingThinkingIndicator, ")");
            const thinkingMessage: Message = {
              id: `thinking_${Date.now()}`,
              role: "assistant",
              content: "Thinking...",
              createdAt: new Date(),
              isThinking: true,
            };
            const finalMessages = [...merged, thinkingMessage];
            console.log("[History] Returning", finalMessages.length, "messages WITH thinking indicator");
            return finalMessages;
          }

          console.log("[History] Returning", merged.length, "messages WITHOUT thinking indicator");
          return merged;
        });

        // Set loading state if streaming is active
        if (shouldShowThinking) {
          console.log("[History] Setting loading state to true for active stream");
          setIsLoading(true);
          // Don't set thinkingStartTimeRef here - wait for the next chunk with startTime from server
          thinkingStartTimeRef.current = null;
          // Set the current message ID ref so new chunks can be appended (if we have an assistant message)
          if (lastMessage && lastMessage.role === "assistant") {
            currentMessageIdRef.current = lastMessage.id;
            console.log("[History] Set currentMessageIdRef to:", lastMessage.id);
          } else {
            console.log("[History] No assistant message to set as current (will be set when first chunk arrives)");
          }
        }
      } else {
        console.log("No messages to process or messages is not an array");
      }
    };

    const handleControl = (data: any) => {
      console.log("handleControl called with:", data);
      if (data.status === "history" || data.type === "history_response") {
        console.log("Processing history data:", data.history);
        console.log("Processing todos data:", data.todos);
        console.log("Processing hasActiveStream:", data.hasActiveStream);
        console.log("Processing maxTokens:", data.maxTokens);
        console.log("Processing tokenUsage:", data.tokenUsage);
        handleHistoryResponse({
          messages: data.history || [],
          hasActiveStream: data.hasActiveStream,
          maxTokens: data.maxTokens,
          tokenUsage: data.tokenUsage
        });

        // Update todos state if provided
        if (data.todos) {
          setTodos(data.todos);
        }
      }
    };

    const handleToolCall = (data: {
      toolCallId: string;
      toolName: string;
      args: any;
      status: string;
      result?: any;
      error?: string;
      assistantMessageId?: string;
    }) => {
      // Only active tab processes tool calls
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("[Tool Call] Received:", data);
      console.log(
        "[Tool Call] Assistant message ID from backend:",
        data.assistantMessageId
      );

      // Map backend status to UI state
      let state: "call" | "executing" | "progress" | "result" | "error" = "call";
      if (data.status === "executing") {
        state = "executing";
      } else if (data.status === "progress") {
        state = "progress";
      } else if (data.status === "complete") {
        state = "result";
      } else if (data.status === "error") {
        state = "error";
      }

      // Store tool invocation with appropriate state
      // Merge with existing invocation to preserve args (like code) across state changes
      const existingInvocation = currentToolInvocationsRef.current.get(data.toolCallId);

      // Track timing: store timestamp on first call, calculate duration on completion
      let timestamp = existingInvocation?.timestamp;
      let duration = existingInvocation?.duration;

      if (!timestamp) {
        // First time seeing this tool - record start time
        timestamp = Date.now();
      }

      if (state === "result" || state === "error") {
        // Tool completed - calculate duration
        duration = timestamp ? Math.round((Date.now() - timestamp) / 1000) : undefined;
      }

      const toolInvocation = {
        state,
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        args: { ...existingInvocation?.args, ...data.args }, // Preserve existing args
        result: data.result,
        error: data.error,
        timestamp,
        duration,
      };
      currentToolInvocationsRef.current.set(data.toolCallId, toolInvocation);

      // Check if any tools are currently executing
      const hasExecutingTools = Array.from(currentToolInvocationsRef.current.values())
        .some(inv => inv.state === "executing" || inv.state === "call");

      // If tools are executing, ensure there's a thinking indicator with tool status
      if (hasExecutingTools && !thinkingStartTimeRef.current) {
        thinkingStartTimeRef.current = Date.now();
      }

      console.log(
        "[Tool Call] Current tool invocations size:",
        currentToolInvocationsRef.current.size
      );
      console.log("[Tool Call] Has executing tools:", hasExecutingTools);

      // Add tool to parts array in arrival order (or update existing) - create new array for React
      const existingPartIndex = currentPartsRef.current.findIndex(
        p => p.type === "tool-invocation" && p.toolInvocation?.toolCallId === data.toolCallId
      );

      if (existingPartIndex !== -1) {
        // Update existing tool part - create new array with updated part
        currentPartsRef.current = currentPartsRef.current.map((part, idx) =>
          idx === existingPartIndex
            ? { ...part, toolInvocation: toolInvocation }
            : part
        );
      } else if (data.status === "executing" || data.status === "call") {
        // Add new tool part on first appearance - create new array
        currentPartsRef.current = [
          ...currentPartsRef.current,
          {
            type: "tool-invocation",
            toolInvocation: toolInvocation,
          }
        ];
      }

      console.log(
        "[Tool Call] Current parts array:",
        currentPartsRef.current.map(p => ({ type: p.type, ...(p.type === "text" ? { textLength: p.text.length } : { toolName: p.toolInvocation.toolName }) }))
      );

      // Update or create assistant message to include tool invocations
      // Use flushSync to ensure immediate rendering, especially for errors
      flushSync(() => {
        setMessages((prev) => {
        const toolInvocations = Array.from(
          currentToolInvocationsRef.current.values()
        );
        const parts = currentPartsRef.current.length > 0
          ? [...currentPartsRef.current]
          : undefined;

        // Check if any tools are currently executing
        const hasExecutingTools = toolInvocations.some(
          inv => inv.state === "executing" || inv.state === "call"
        );

        console.log("[Tool Call] Tool invocations array:", toolInvocations);
        console.log("[Tool Call] Parts array:", parts);
        console.log("[Tool Call] Has executing tools:", hasExecutingTools);

        // Separate thinking indicator from other messages
        const thinkingMsg = prev.find((m) => m.isThinking);
        const otherMessages = prev.filter((m) => !m.isThinking);

        // If tools are executing, ensure we have a thinking indicator with updated text
        let thinkingIndicator = thinkingMsg;
        if (hasExecutingTools) {
          // Get the first executing tool name for display
          const executingTool = toolInvocations.find(
            inv => inv.state === "executing" || inv.state === "call"
          );
          const toolName = executingTool?.toolName || "tool";

          // Create or update thinking indicator for tool execution
          thinkingIndicator = {
            id: `thinking_${Date.now()}`,
            role: "assistant",
            content: `Running ${toolName}...`,
            createdAt: new Date(),
            isThinking: true,
          };

          console.log("[Tool Call] Creating tool thinking indicator:", thinkingIndicator.content);
        }

        // Look for message with matching ID if provided
        if (data.assistantMessageId) {
          const existingIndex = otherMessages.findIndex(
            (m) => m.id === data.assistantMessageId
          );
          console.log(
            "[Tool Call] Looking for message with ID:",
            data.assistantMessageId,
            "found at index:",
            existingIndex
          );

          if (existingIndex !== -1) {
            // Update existing message
            console.log(
              "[Tool Call] Updating existing message at index:",
              existingIndex
            );
            const updated = otherMessages.map((msg, idx) =>
              idx === existingIndex
                ? { ...msg, toolInvocations, ...(parts && { parts }) }
                : msg
            );
            // FIX: Only add thinking indicator if one doesn't already exist in the result
            const hasThinkingIndicator = updated.some((m) => "isThinking" in m && m.isThinking);
            return !hasThinkingIndicator && thinkingIndicator
              ? [...updated, thinkingIndicator]
              : updated;
          }
        }

        // Try to find message by currentMessageIdRef (from streaming chunks)
        const currentMsgIndex = otherMessages.findIndex(
          (m) => m.id === currentMessageIdRef.current
        );
        if (currentMsgIndex !== -1) {
          console.log(
            "[Tool Call] Found message by currentMessageIdRef:",
            currentMessageIdRef.current
          );
          const updated = otherMessages.map((msg, idx) =>
            idx === currentMsgIndex
              ? { ...msg, toolInvocations, ...(parts && { parts }) }
              : msg
          );
          // FIX: Only add thinking indicator if one doesn't already exist in the result
          const hasThinkingIndicator = updated.some((m) => "isThinking" in m && m.isThinking);
          return !hasThinkingIndicator && thinkingIndicator
            ? [...updated, thinkingIndicator]
            : updated;
        }

        // Check if last non-thinking message is assistant
        const lastMsg = otherMessages[otherMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          console.log(
            "[Tool Call] Updating last assistant message:",
            lastMsg.id
          );
          const updated = otherMessages.map((msg, idx) =>
            idx === otherMessages.length - 1
              ? { ...msg, toolInvocations, ...(parts && { parts }) }
              : msg
          );
          // FIX: Only add thinking indicator if one doesn't already exist in the result
          const hasThinkingIndicator = updated.some((m) => "isThinking" in m && m.isThinking);
          return !hasThinkingIndicator && thinkingIndicator
            ? [...updated, thinkingIndicator]
            : updated;
        }

        // Otherwise, create a placeholder assistant message using the ID from backend
        const messageId =
          data.assistantMessageId ||
          currentMessageIdRef.current ||
          `msg_${Date.now()}_assistant`;
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
        // FIX: Only add thinking indicator if one doesn't already exist in the result
        const hasThinkingIndicator = updated.some((m) => "isThinking" in m && m.isThinking);
        return !hasThinkingIndicator && thinkingIndicator
          ? [...updated, thinkingIndicator]
          : updated;
        });
      });
    };

    const handleToolResult = (data: {
      toolCallId: string;
      toolName: string;
      result: any;
    }) => {
      // Only active tab processes tool results
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("[Tool Result] Received:", data);

      // Update tool invocation to "result" or "error" state based on result content
      const existingInvocation = currentToolInvocationsRef.current.get(
        data.toolCallId
      );
      if (existingInvocation) {
        // Check if result contains an error
        const hasError = data.result && data.result.error;

        if (hasError) {
          console.log(`[Tool Result] Error detected in result for ${data.toolName}:`, data.result.error);
        }

        const updatedInvocation = {
          ...existingInvocation,
          state: hasError ? ("error" as const) : ("result" as const),
          result: hasError ? undefined : data.result,
          error: hasError ? data.result.error : undefined,
        };
        currentToolInvocationsRef.current.set(data.toolCallId, updatedInvocation);

        // Update parts array to reflect the new state
        const existingPartIndex = currentPartsRef.current.findIndex(
          p => p.type === "tool-invocation" && p.toolInvocation?.toolCallId === data.toolCallId
        );

        if (existingPartIndex !== -1) {
          // Update existing tool part with result - create new array
          currentPartsRef.current = currentPartsRef.current.map((part, idx) =>
            idx === existingPartIndex
              ? { ...part, toolInvocation: updatedInvocation }
              : part
          );
        }

        // Update the current assistant message
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            const toolInvocations = Array.from(
              currentToolInvocationsRef.current.values()
            );
            const parts = currentPartsRef.current.length > 0
              ? [...currentPartsRef.current]
              : undefined;

            // Check if any tools are still executing
            const hasExecutingTools = toolInvocations.some(
              inv => inv.state === "executing" || inv.state === "call"
            );

            console.log("[Tool Result] Has executing tools after result:", hasExecutingTools);

            // If no tools are executing, remove thinking indicator. If tools are still executing, update it.
            if (hasExecutingTools) {
              // Get the first executing tool name for display
              const executingTool = toolInvocations.find(
                inv => inv.state === "executing" || inv.state === "call"
              );
              const toolName = executingTool?.toolName || "tool";

              const thinkingIndicator = {
                id: `thinking_${Date.now()}`,
                role: "assistant",
                content: `Running ${toolName}...`,
                createdAt: new Date(),
                isThinking: true,
              };

              // Update message and keep thinking indicator
              const updated = prev.map((msg, idx) =>
                idx === prev.length - 1
                  ? { ...msg, toolInvocations, ...(parts && { parts }) }
                  : msg
              );
              const hasThinking = updated.some((m) => m.isThinking);
              return !hasThinking ? [...updated, thinkingIndicator] : updated;
            } else {
              // All tools done - remove thinking indicator and update message
              return prev.map((msg, idx) => {
                if (idx === prev.length - 1) {
                  return { ...msg, toolInvocations, ...(parts && { parts }) };
                }
                // Remove thinking indicator
                return msg.isThinking ? (undefined as any) : msg;
              }).filter(Boolean);
            }
          }
          return prev;
        });
      }
    };

    const handleTodoUpdate = (data: { todos: any }) => {
      // Only active tab processes todo updates
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("[Todo Update] Received:", data);
      setTodos(data.todos);
    };

    const handleConversationTitleUpdate = (data: { title: string }) => {
      // Only active tab processes title updates
      if (!activeTabManager.isActiveTab(componentRef.current, convId)) return;
      console.log("[Title Update] Received new title:", data.title);

      // Refresh conversation list to show updated title
      if (currentProject?.id) {
        refreshConversations(currentProject.id);
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
    wsClient.on("todo_update", handleTodoUpdate);
    wsClient.on("conversation_title_update", handleConversationTitleUpdate);

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
      wsClient.off("todo_update", handleTodoUpdate);
      wsClient.off("conversation_title_update", handleConversationTitleUpdate);
    };
  }, [wsClient, convId, componentRef, setMessages, setIsLoading, setIsHistoryLoading, setError, setTodos, isLoading, thinkingStartTimeRef, currentMessageRef, currentMessageIdRef, currentToolInvocationsRef, currentPartsRef, refreshConversations, currentProject]);
}
