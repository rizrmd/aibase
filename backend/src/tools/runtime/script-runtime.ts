import type { Tool } from "../../llm/conversation";
import { createDuckDBFunction } from "./duckdb";
import { createPostgreSQLFunction } from "./postgresql";
import { createPDFReaderFunction } from "./pdfreader";
import { createWebSearchFunction } from "./web-search";

/**
 * Context provided to the script execution environment
 */
export interface ScriptContext {
  convId: string;
  projectId: string;
  tools: Map<string, Tool>;
  broadcast: (type: "tool_call" | "tool_result", data: any) => void;
  toolCallId: string;
  purpose: string;
  code: string;
}

/**
 * Runtime for executing TypeScript code with access to registered tools
 * Uses AsyncFunction for same-process execution with controlled scope
 * Bun handles TypeScript syntax natively in AsyncFunction
 */
export class ScriptRuntime {
  constructor(private context: ScriptContext) {
    // No transpiler needed - Bun handles TypeScript in AsyncFunction natively
  }

  /**
   * Execute TypeScript code in a controlled scope
   */
  async execute(code: string): Promise<any> {
    try {
      // Build execution scope with injected functions and context
      const scope = this.buildScope();

      // Execute using AsyncFunction constructor with controlled scope
      const AsyncFunction = (async function () {}).constructor as any;
      const argNames = Object.keys(scope);
      const argValues = Object.values(scope);

      // Create and execute the function
      // Code runs directly as async function body - Bun handles TypeScript syntax
      const fn = new AsyncFunction(...argNames, code);
      console.log('[ScriptRuntime] Executing code...');
      const result = await fn(...argValues);
      console.log('[ScriptRuntime] Execution completed successfully');

      return result;
    } catch (error: any) {
      console.error('[ScriptRuntime] Execution error:', error);
      throw error;
    }
  }

  /**
   * Build the execution scope with injected tools, functions, and context
   */
  private buildScope(): Record<string, any> {
    const scope: Record<string, any> = {
      // Context variables
      convId: this.context.convId,
      projectId: this.context.projectId,

      // Allow console for debugging
      console: console,

      // Enable HTTP requests
      fetch: fetch,

      // Inject progress function for status updates
      progress: this.createProgressFunction(),

      // Inject DuckDB query function
      duckdb: this.createDuckDBFunction(),

      // Inject PostgreSQL query function
      postgresql: this.createPostgreSQLFunction(),

      // Inject PDF reader function
      pdfReader: this.createPDFReaderFunction(),

      // Inject web search function
      webSearch: this.createWebSearchFunction(),
    };

    // Inject all registered tools as callable functions
    for (const [name, tool] of this.context.tools) {
      if (name === "script") continue; // Prevent recursive calls

      scope[name] = this.createToolFunction(name, tool);
    }

    return scope;
  }

  /**
   * Create the progress function for sending status updates
   */
  private createProgressFunction() {
    return (message: string, data?: any) => {
      this.context.broadcast("tool_call", {
        toolCallId: this.context.toolCallId,
        toolName: "script",
        args: { purpose: this.context.purpose, code: this.context.code },
        status: "progress",
        result: { message, data },
      });
    };
  }

  /**
   * Get the DuckDB query function
   */
  private createDuckDBFunction() {
    // Set working directory to the conversation's files directory
    const cwd = `data/${this.context.projectId}/${this.context.convId}/files`;
    // Return the DuckDB function from the modular implementation
    return createDuckDBFunction(cwd);
  }

  /**
   * Get the PostgreSQL query function
   */
  private createPostgreSQLFunction() {
    // Return the PostgreSQL function (requires direct connection URL)
    return createPostgreSQLFunction();
  }

  /**
   * Get the PDF reader function
   */
  private createPDFReaderFunction() {
    // Set working directory to the conversation's files directory
    const cwd = `data/${this.context.projectId}/${this.context.convId}/files`;
    // Return the PDF reader function from the modular implementation
    return createPDFReaderFunction(cwd);
  }

  /**
   * Get the web search function
   */
  private createWebSearchFunction() {
    // Return the web search function from the modular implementation
    return createWebSearchFunction();
  }

  /**
   * Create a wrapper function for a tool that handles broadcasting
   */
  private createToolFunction(name: string, tool: Tool) {
    return async (args: any) => {
      // Generate unique ID for this sub-tool call
      const subToolCallId = `${this.context.toolCallId}-${name}-${Date.now()}`;

      // Broadcast tool execution start
      this.context.broadcast("tool_call", {
        toolCallId: subToolCallId,
        toolName: name,
        args,
        status: "start",
      });

      try {
        // Execute the actual tool
        const result = await tool.execute(args);

        // Broadcast successful result
        this.context.broadcast("tool_result", {
          toolCallId: subToolCallId,
          result,
        });

        return result;
      } catch (error: any) {
        // Broadcast error
        this.context.broadcast("tool_call", {
          toolCallId: subToolCallId,
          toolName: name,
          args,
          status: "error",
          error: error.message,
        });

        // Re-throw to allow script to handle error
        throw error;
      }
    };
  }
}
