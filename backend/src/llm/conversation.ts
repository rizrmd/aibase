import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat/completions";
import { defaultContext } from "./context";
import { updateTokenUsage } from "./conversation-info";

/**
 * Type for function tool calls (excludes custom tool calls)
 */
type FunctionToolCall = ChatCompletionMessageFunctionToolCall;

/**
 * Type for a hybrid async generator that can be both awaited and iterated
 */
type HybridGenerator = AsyncGenerator<string, string, unknown> & Promise<string>;

/**
 * Base class for tools that can be called by the LLM
 */
export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, unknown>; // JSON Schema for parameters

  /**
   * Execute the tool with given arguments
   */
  abstract execute(args: unknown): Promise<unknown>;

  /**
   * Convert tool to OpenAI function definition format
   */
  toOpenAITool(): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Hooks for message-related events
 */
export interface MessageHooks {
  /**
   * Called before sending a message to the LLM
   */
  before?: (
    message: string,
    history: ChatCompletionMessageParam[]
  ) => void | Promise<void>;

  /**
   * Called after receiving the complete response
   */
  after?: (
    response: string,
    history: ChatCompletionMessageParam[]
  ) => void | Promise<void>;

  /**
   * Called when streaming starts
   */
  start?: () => void | Promise<void>;

  /**
   * Called for each chunk during streaming
   */
  chunk?: (chunk: string, fullText: string) => void | Promise<void>;

  /**
   * Called when streaming completes
   */
  end?: (fullText: string) => void | Promise<void>;

  /**
   * Called when a message is canceled/aborted
   */
  cancel?: (partialText: string) => void | Promise<void>;
}

/**
 * Hooks for tool execution events
 */
export interface ToolHooks {
  /**
   * Called before executing a tool
   */
  before?: (
    toolCallId: string,
    toolName: string,
    args: any
  ) => void | Promise<void>;

  /**
   * Called after executing a tool successfully
   */
  after?: (
    toolCallId: string,
    toolName: string,
    args: any,
    result: any
  ) => void | Promise<void>;

  /**
   * Called when a tool execution fails
   */
  error?: (
    toolCallId: string,
    toolName: string,
    args: any,
    error: Error
  ) => void | Promise<void>;
}

/**
 * Conversation hooks/callbacks for monitoring and controlling conversation flow
 */
export interface ConversationHooks {
  /**
   * Message-related hooks
   */
  message?: MessageHooks;

  /**
   * Tool execution hooks
   */
  tools?: ToolHooks;

  /**
   * Called when any error occurs in the conversation
   */
  error?: (error: Error, context: string) => void | Promise<void>;

  /**
   * Called when the conversation history is modified
   */
  history?: (history: ChatCompletionMessageParam[]) => void | Promise<void>;
}

/**
 * Configuration options for Conversation
 */
export interface ConversationOptions {
  /**
   * System prompt to set the assistant's behavior
   */
  systemPrompt?: string;

  /**
   * Tools available to the conversation
   */
  tools?: Tool[];

  /**
   * Initial message history
   */
  initialHistory?: ChatCompletionMessageParam[];

  /**
   * Hooks for monitoring and controlling conversation flow
   */
  hooks?: ConversationHooks;

  /**
   * Maximum number of messages to keep in history (0 = unlimited)
   */
  maxHistoryLength?: number;

  /**
   * Model-specific parameters
   */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  thinking?: { type: "disabled" | "enabled" };

  /**
   * Conversation ID for loading context-specific data
   */
  convId?: string;

  /**
   * Project ID for loading context-specific data
   */
  projectId?: string;

  /**
   * URL parameters for placeholder replacement in context (e.g., { hewan: "burung" })
   * Use {{param_name}} in context template to reference these values
   */
  urlParams?: Record<string, string>;
}

/**
 * Main Conversation class that handles LLM interactions with tool calling support
 */
export class Conversation {
  private client: OpenAI;
  private model: string;
  private _history: ChatCompletionMessageParam[] = [];
  private tools: Map<string, Tool> = new Map();
  private hooks: ConversationHooks;
  private maxHistoryLength: number;
  private modelParams: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    thinking?: { type: "disabled" | "enabled" };
  } = {};
  private currentAbortController: AbortController | null = null;
  private convId: string = "default";
  private projectId: string = "A1";
  private urlParams: Record<string, string> | undefined;

  /**
   * Create a new Conversation instance
   * Use this static factory method instead of constructor to support async initialization
   */
  static async create(options: ConversationOptions = {}): Promise<Conversation> {
    const conversation = new Conversation();
    await conversation.initialize(options);
    return conversation;
  }

  private constructor() {
    this.client = new OpenAI({ baseURL: process.env.OPENAI_BASE_URL, apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL as string;
    this.hooks = {};
    this.maxHistoryLength = 0;
  }

  private async initialize(options: ConversationOptions = {}): Promise<void> {
    this.hooks = options.hooks || {};
    this.maxHistoryLength = options.maxHistoryLength || 0;

    // Set conversation identifiers
    this.convId = options.convId || "default";
    this.projectId = options.projectId || "A1";

    // Store URL parameters for context replacement
    this.urlParams = options.urlParams;

    // Set model parameters
    if (options.temperature !== undefined)
      this.modelParams.temperature = options.temperature;
    if (options.maxTokens !== undefined)
      this.modelParams.max_tokens = options.maxTokens;
    if (options.topP !== undefined) this.modelParams.top_p = options.topP;
    if (options.thinking !== undefined)
      this.modelParams.thinking = options.thinking;

    // Check if initialHistory already contains a system message
    const hasSystemMessage = options.initialHistory?.some(
      (msg) => msg.role === "system"
    );

    // Only add system prompt if initialHistory doesn't already have one
    if (!hasSystemMessage) {
      // Initialize history with system prompt
      // Start with default context and append custom systemPrompt if provided
      const baseContext = await defaultContext(this.convId, this.projectId, this.urlParams);
      const systemPrompt = options.systemPrompt
        ? `${baseContext}\n\n${options.systemPrompt}`
        : baseContext;

      this._history.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // Add initial history if provided
    if (options.initialHistory) {
      this._history.push(...options.initialHistory);
    }

    // Register tools
    if (options.tools) {
      for (const tool of options.tools) {
        this.registerTool(tool);
      }
    }
  }

  /**
   * Get conversation history
   */
  get history(): ChatCompletionMessageParam[] {
    return [...this._history]; // Return a copy to prevent direct modification
  }

  /**
   * Set conversation history
   */
  set history(value: ChatCompletionMessageParam[]) {
    this._history = [...value];
    this.hooks.history?.(this._history);
    this.trimHistory();
  }

  /**
   * Register a tool for the conversation
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool from the conversation
   */
  unregisterTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  /**
   * Get all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get the tools registry (for internal use by script tool)
   */
  getToolsRegistry(): Map<string, Tool> {
    return this.tools;
  }

  /**
   * Add a message to history
   */
  addMessage(message: ChatCompletionMessageParam): void {
    this._history.push(message);
    this.hooks.history?.(this._history);
    this.trimHistory();
  }

  /**
   * Clear conversation history (optionally keeping system prompt)
   */
  clearHistory(keepSystemPrompt: boolean = true): void {
    if (keepSystemPrompt && this._history[0]?.role === "system") {
      this._history = [this._history[0]];
    } else {
      this._history = [];
    }
    this.hooks.history?.(this._history);
  }

  /**
   * Trim history to max length if configured
   */
  private trimHistory(): void {
    if (
      this.maxHistoryLength > 0 &&
      this._history.length > this.maxHistoryLength
    ) {
      // Keep system prompt if it exists
      const systemPrompt =
        this._history[0]?.role === "system" ? [this._history[0]] : [];
      const messagesToKeep = this._history.slice(
        -this.maxHistoryLength + systemPrompt.length
      );
      this._history = [...systemPrompt, ...messagesToKeep];
    }
  }

  /**
   * Abort the current ongoing message stream
   */
  abort(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Check if there's an ongoing message being processed
   */
  isProcessing(): boolean {
    return this.currentAbortController !== null;
  }

  /**
   * Send a message and stream the response
   * Can be used both as an async generator (for streaming) or awaited (for non-streaming)
   *
   * Usage:
   * - Streaming: `for await (const chunk of conversation.sendMessage("hello")) { ... }`
   * - Non-streaming: `const fullText = await conversation.sendMessage("hello")`
   */
  sendMessage(
    message: string,
    attachments?: any[]
  ): HybridGenerator {
    // Create new AbortController for this message
    this.currentAbortController = new AbortController();
    const generator = this.streamMessageInternal(
      message,
      this.currentAbortController,
      attachments
    );

    // Make the generator both awaitable and iterable
    const hybrid = generator as unknown as HybridGenerator;

    // When awaited, collect all chunks
    hybrid.then = <TResult1 = string, TResult2 = never>(
      onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> => {
      return (async () => {
        try {
          let fullText = "";
          for await (const chunk of generator) {
            fullText += chunk;
          }
          return fullText;
        } catch (error) {
          throw error;
        } finally {
          this.currentAbortController = null;
        }
      })().then(onfulfilled, onrejected);
    };

    hybrid.catch = <TResult = never>(
      onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
    ): Promise<string | TResult> => {
      return hybrid.then(undefined, onrejected);
    };

    hybrid.finally = (onfinally?: (() => void) | null): Promise<string> => {
      return hybrid.then(
        (value: string) => {
          onfinally?.();
          return value;
        },
        (reason: unknown) => {
          onfinally?.();
          throw reason;
        }
      );
    };

    return hybrid;
  }

  /**
   * Internal method to stream a message
   */
  private async *streamMessageInternal(
    message: string,
    abortController: AbortController,
    attachments?: any[]
  ): AsyncGenerator<string, void, unknown> {
    let fullText = "";
    try {
      await this.hooks.message?.before?.(message, this._history);
      await this.hooks.message?.start?.();

      // Add user message to history
      const userMessage: ChatCompletionMessageParam & { _attachments?: any[] } = {
        role: "user",
        content: message,
        ...(attachments && attachments.length > 0 && { _attachments: attachments }),
      };
      this.addMessage(userMessage);

      // Stream the continuation (handles tool calls recursively)
      for await (const chunk of this.streamContinuation(abortController)) {
        // Check if aborted
        if (abortController.signal.aborted) {
          throw new Error("Message aborted");
        }
        fullText += chunk;
        yield chunk;
      }

      await this.hooks.message?.end?.(fullText);
      await this.hooks.message?.after?.(fullText, this._history);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Call cancel hook for abort errors
      if (err.message === "Message aborted") {
        await this.hooks.message?.cancel?.(fullText);
      } else {
        await this.hooks.error?.(err, "sendMessage");
      }
      throw err;
    }
  }

  /**
   * Internal method to stream a continuation of the conversation
   * This handles both regular responses and tool call responses recursively
   */
  private async *streamContinuation(
    abortController: AbortController
  ): AsyncGenerator<string, void, unknown> {
    let fullText = "";
    let currentToolCalls: FunctionToolCall[] = [];
    let isToolCallResponse = false;
    let assistantMessageIndex = -1; // Track the assistant message index for updates
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: this._history,
        tools: this.getOpenAITools(),
        stream: true,
        stream_options: { include_usage: true },
        ...this.modelParams,
      },
      {
        signal: abortController.signal as any,
      }
    );

    try {
      for await (const chunk of stream) {
        // Check if aborted
        if (abortController.signal.aborted) {
          break;
        }

        const delta = chunk.choices[0]?.delta;

        // Capture usage information if present
        if (chunk.usage) {
          usage = chunk.usage;
          console.log(`[Conversation] Captured usage from chunk:`, usage);
        }

        if (delta?.content) {
          fullText += delta.content;

          // Add placeholder message on first content chunk
          if (assistantMessageIndex === -1 && !isToolCallResponse) {
            this.addMessage({
              role: "assistant",
              content: "", // Start with empty content
            });
            assistantMessageIndex = this._history.length - 1;
          }

          // Update the assistant message content as we stream
          if (assistantMessageIndex >= 0 && !isToolCallResponse) {
            this._history[assistantMessageIndex] = {
              ...(this._history[assistantMessageIndex] as ChatCompletionAssistantMessageParam),
              content: fullText,
            };
          }

          await this.hooks.message?.chunk?.(delta.content, fullText);
          yield delta.content;
        }

        // Handle streaming tool calls
        if (delta?.tool_calls) {
          isToolCallResponse = true;
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (!currentToolCalls[index]) {
              currentToolCalls[index] = {
                id: toolCall.id || "",
                type: "function",
                function: {
                  name: toolCall.function?.name || "",
                  arguments: "",
                },
              };
            }
            if (toolCall.function?.arguments) {
              currentToolCalls[index].function.arguments +=
                toolCall.function.arguments;
            }
          }
        }
      }
    } catch (error: unknown) {
      // If aborted, keep the partial message in history (it's already been added)
      if ((error as Error)?.name === "AbortError" || abortController.signal.aborted) {
        return;
      }
      throw error;
    }

    // Only add to history if not aborted
    if (abortController.signal.aborted) {
      return;
    }

    // Store token usage if available
    if (usage) {
      console.log(`[Conversation] Storing token usage for convId ${this.convId}:`, {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      });
      try {
        await updateTokenUsage(this.convId, this.projectId, {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        });
        console.log(`[Conversation] Successfully stored token usage for convId ${this.convId}`);
      } catch (error) {
        // Log error but don't fail the conversation
        console.error("Failed to update token usage:", error);
      }
    } else {
      console.log(`[Conversation] No usage information available to store for convId ${this.convId}`);
    }

    // Add assistant's response to history
    if (isToolCallResponse && currentToolCalls.length > 0) {
      // Combine text content and tool_calls in one message
      // This preserves the order: text appears before tool calls
      if (assistantMessageIndex >= 0 && fullText) {
        // Update existing message with both content and tool_calls
        this._history[assistantMessageIndex] = {
          ...(this._history[assistantMessageIndex] as ChatCompletionAssistantMessageParam),
          content: fullText,
          tool_calls: currentToolCalls,
        };
      } else if (fullText) {
        // Add new message with both content and tool_calls
        this.addMessage({
          role: "assistant",
          content: fullText,
          tool_calls: currentToolCalls,
        });
      } else {
        // No text content, just tool_calls
        this.addMessage({
          role: "assistant",
          tool_calls: currentToolCalls,
        });
      }

      // Execute tool calls
      await this.executeToolCalls(currentToolCalls);

      // Recursively stream the next response after tool execution
      yield* this.streamContinuation(abortController);
    } else {
      // If we already added the message during streaming, just ensure it has the final content
      if (assistantMessageIndex >= 0) {
        this._history[assistantMessageIndex] = {
          ...(this._history[assistantMessageIndex] as ChatCompletionAssistantMessageParam),
          content: fullText,
        };
      } else {
        // Fallback: add the message (shouldn't happen in normal flow)
        this.addMessage({
          role: "assistant",
          content: fullText,
        });
      }
    }
  }

  /**
   * Execute tool calls and add results to history
   */
  private async executeToolCalls(toolCalls: FunctionToolCall[]): Promise<void> {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const tool = this.tools.get(toolName);

      if (!tool) {
        const errorMessage = `Tool "${toolName}" not found`;
        await this.hooks.tools?.error?.(
          toolCall.id,
          toolName,
          {},
          new Error(errorMessage)
        );

        this.addMessage({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMessage }),
        });
        continue;
      }

      try {
        const args = JSON.parse(toolCall.function.arguments);

        // Special handling for script tool - inject context before execution
        if (toolName === "script" && "setToolsRegistry" in tool) {
          (tool as any).setToolsRegistry(this.tools);
          (tool as any).setToolCallId(toolCall.id);

          // Inject broadcast function for progress and sub-tool updates
          (tool as any).setBroadcast(
            (type: "tool_call" | "tool_result", data: any) => {
              // Call hook with full data including status
              if (type === "tool_call") {
                // For tool_call type, pass the data through the before hook
                // The hook implementation in ws/entry.ts will broadcast with status
                this.hooks.tools?.before?.(
                  data.toolCallId,
                  data.toolName,
                  { ...data.args, __status: data.status, __result: data.result }
                );
              } else {
                this.hooks.tools?.after?.(
                  data.toolCallId,
                  data.toolName,
                  data.args,
                  data.result
                );
              }
            }
          );
        }

        // Skip the main hook call for script tool - it handles its own broadcasting
        // For all other tools, call the before hook
        if (toolName !== "script") {
          await this.hooks.tools?.before?.(toolCall.id, toolName, args);
        }

        const result = await tool.execute(args);

        // Skip the main hook call for script tool - it handles its own broadcasting
        if (toolName !== "script") {
          await this.hooks.tools?.after?.(toolCall.id, toolName, args, result);
        }

        // Add tool result to history
        this.addMessage({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        await this.hooks.tools?.error?.(toolCall.id, toolName, {}, err);

        // Add error result to history
        this.addMessage({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err.message }),
        });
      }
    }
  }

  /**
   * Get tools in OpenAI format
   */
  private getOpenAITools(): ChatCompletionTool[] | undefined {
    if (this.tools.size === 0) return undefined;
    return Array.from(this.tools.values()).map((tool) => tool.toOpenAITool());
  }
}
