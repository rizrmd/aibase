import { createOpenAI } from "./config";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

/**
 * Base class for tools that can be called by the LLM
 */
export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, any>; // JSON Schema for parameters

  /**
   * Execute the tool with given arguments
   */
  abstract execute(args: any): Promise<any>;

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
  before?: (message: string, history: ChatCompletionMessageParam[]) => void | Promise<void>;

  /**
   * Called after receiving the complete response
   */
  after?: (response: string, history: ChatCompletionMessageParam[]) => void | Promise<void>;

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
}

/**
 * Hooks for tool execution events
 */
export interface ToolHooks {
  /**
   * Called before executing a tool
   */
  before?: (toolCallId: string, toolName: string, args: any) => void | Promise<void>;

  /**
   * Called after executing a tool successfully
   */
  after?: (toolCallId: string, toolName: string, args: any, result: any) => void | Promise<void>;

  /**
   * Called when a tool execution fails
   */
  error?: (toolCallId: string, toolName: string, args: any, error: Error) => void | Promise<void>;
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
   * Name of the AI config to use from ai.json (defaults to "default")
   */
  configName?: string;

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
  } = {};

  constructor(options: ConversationOptions = {}) {
    const config = createOpenAI(options.configName);
    this.client = config.client;
    this.model = config.model;
    this.hooks = options.hooks || {};
    this.maxHistoryLength = options.maxHistoryLength || 0;

    // Set model parameters
    if (options.temperature !== undefined) this.modelParams.temperature = options.temperature;
    if (options.maxTokens !== undefined) this.modelParams.max_tokens = options.maxTokens;
    if (options.topP !== undefined) this.modelParams.top_p = options.topP;

    // Initialize history with system prompt if provided
    if (options.systemPrompt) {
      this._history.push({
        role: "system",
        content: options.systemPrompt,
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
    if (this.maxHistoryLength > 0 && this._history.length > this.maxHistoryLength) {
      // Keep system prompt if it exists
      const systemPrompt = this._history[0]?.role === "system" ? [this._history[0]] : [];
      const messagesToKeep = this._history.slice(-this.maxHistoryLength + systemPrompt.length);
      this._history = [...systemPrompt, ...messagesToKeep];
    }
  }

  /**
   * Send a message and stream the response
   * Can be used both as an async generator (for streaming) or awaited (for non-streaming)
   *
   * Usage:
   * - Streaming: `for await (const chunk of conversation.sendMessage("hello")) { ... }`
   * - Non-streaming: `const fullText = await conversation.sendMessage("hello")`
   */
  sendMessage(message: string): AsyncGenerator<string, string, unknown> & Promise<string> {
    const generator = this.streamMessageInternal(message);

    // Make the generator both awaitable and iterable
    const hybrid = generator as any;

    // When awaited, collect all chunks
    hybrid.then = (resolve: (value: string) => void, reject?: (reason: any) => void) => {
      return (async () => {
        try {
          let fullText = "";
          for await (const chunk of generator) {
            fullText += chunk;
          }
          return fullText;
        } catch (error) {
          throw error;
        }
      })().then(resolve, reject);
    };

    hybrid.catch = (reject: (reason: any) => void) => {
      return hybrid.then(undefined, reject);
    };

    hybrid.finally = (onfinally: () => void) => {
      return hybrid.then(
        (value: string) => {
          onfinally();
          return value;
        },
        (reason: any) => {
          onfinally();
          throw reason;
        }
      );
    };

    return hybrid;
  }

  /**
   * Internal method to stream a message
   */
  private async *streamMessageInternal(message: string): AsyncGenerator<string, void, unknown> {
    try {
      await this.hooks.message?.before?.(message, this._history);
      await this.hooks.message?.start?.();

      // Add user message to history
      const userMessage: ChatCompletionMessageParam = {
        role: "user",
        content: message,
      };
      this.addMessage(userMessage);

      let fullText = "";

      // Stream the continuation (handles tool calls recursively)
      for await (const chunk of this.streamContinuation()) {
        fullText += chunk;
        yield chunk;
      }

      await this.hooks.message?.end?.(fullText);
      await this.hooks.message?.after?.(fullText, this._history);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.hooks.error?.(err, "sendMessage");
      throw err;
    }
  }

  /**
   * Internal method to stream a continuation of the conversation
   * This handles both regular responses and tool call responses recursively
   */
  private async *streamContinuation(): AsyncGenerator<string, void, unknown> {
    let fullText = "";
    let currentToolCalls: any[] = [];
    let isToolCallResponse = false;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this._history,
      tools: this.getOpenAITools(),
      stream: true,
      ...this.modelParams,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullText += delta.content;
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
              function: { name: toolCall.function?.name || "", arguments: "" },
            };
          }
          if (toolCall.function?.arguments) {
            currentToolCalls[index].function.arguments += toolCall.function.arguments;
          }
        }
      }
    }

    // Add assistant's response to history
    if (isToolCallResponse && currentToolCalls.length > 0) {
      this.addMessage({
        role: "assistant",
        tool_calls: currentToolCalls,
      });

      // Execute tool calls
      await this.executeToolCalls(currentToolCalls);

      // Recursively stream the next response after tool execution
      yield* this.streamContinuation();
    } else {
      this.addMessage({
        role: "assistant",
        content: fullText,
      });
    }
  }

  /**
   * Execute tool calls and add results to history
   */
  private async executeToolCalls(toolCalls: any[]): Promise<void> {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const tool = this.tools.get(toolName);

      if (!tool) {
        const errorMessage = `Tool "${toolName}" not found`;
        await this.hooks.tools?.error?.(toolCall.id, toolName, {}, new Error(errorMessage));

        this.addMessage({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMessage }),
        });
        continue;
      }

      try {
        const args = JSON.parse(toolCall.function.arguments);

        await this.hooks.tools?.before?.(toolCall.id, toolName, args);

        const result = await tool.execute(args);

        await this.hooks.tools?.after?.(toolCall.id, toolName, args, result);

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
