import { Tool } from "../../llm/conversation";
import { ScriptRuntime, context as scriptRuntimeContext } from "../extensions/script-runtime";
import { storeOutput } from "../extensions/shared/output-storage";
import { ExtensionLoader } from "../extensions/extension-loader";

/**
 * Script Tool context
 * Note: Detailed examples are in the Script Tool's description parameter
 * This context is intentionally brief to avoid confusion with project extensions
 */
export const context = async () => {
  return scriptRuntimeContext();
};

/**
 * Script Tool - Execute TypeScript code with programmatic access to other tools
 *
 * This tool enables:
 * - Batch operations across multiple files
 * - Complex multi-step workflows
 * - Data transformation pipelines
 * - Programmatic tool composition
 * - SQL queries on CSV/Excel/Parquet files via DuckDB
 *
 * Available in execution scope:
 * - All registered tools as async functions
 * - progress(message, data?) for status updates
 *   Note: timelimit values: 'd', 'w', 'm', 'y' (auto-converts to MCP format)
 * - duckdb(options) for SQL queries on data files
 *   Options: { query, database?, format?, readonly? }
 * - postgresql(options) for PostgreSQL database queries
 *   Options: { query, connectionUrl?, format?, timeout? }
 *   Note: Credentials can be stored in memory for security
 * - clickhouse(options) for ClickHouse database queries
 *   Options: { query, serverUrl?, database?, username?, password?, format?, timeout?, params? }
 *   Note: Credentials can be stored in memory for security
 * - trino(options) for Trino distributed queries
 *   Options: { query, serverUrl?, catalog?, schema?, username?, password?, format?, timeout? }
 *   Note: Credentials can be stored in memory for security
 * - pdfReader(options) for extracting text from PDF files
 *   Options: { filePath?, buffer?, password?, maxPages?, debug? }
 *   Note: Passwords can be stored in memory for security
 * - Project extensions (loaded dynamically) - see extension context for available functions
 * - convId, projectId, and CURRENT_UID for context
 * - console for debugging
 * - fetch for HTTP requests
 */
export class ScriptTool extends Tool {
  name = "script";

  description = `Execute Bun TypeScript code with programmatic access to other tools.
SECURITY REQUIREMENT: NEVER hardcode credentials (API keys, database URLs, passwords) directly in script code. ALWAYS store credentials in memory first using the memory tool, then access them using memory.read(category, key). This is a mandatory security practice - hardcoding credentials exposes secrets in code history and logs.
Context variables: convId, projectId, CURRENT_UID (user ID from authentication token - will be empty string "" if not authenticated). Note: Bun is used instead of Node.js (Do not use require).`;

  parameters = {
    type: "object",
    properties: {
      purpose: {
        type: "string",
        description: "A one-sentence description of what this script does (e.g., 'Process all project files and generate summary').",
      },
      code: {
        type: "string",
        description: `TypeScript code to execute.

CRITICAL - Multi-line Code Format:
- ALWAYS use ACTUAL newline characters, NEVER escape them with \\n
- When generating multi-line code, put actual line breaks in the string value
- ✓ CORRECT: Write multi-line strings naturally with real newlines
- ✗ WRONG: NEVER use \\n, \\t, or any escape sequences between statements
- ✗ WRONG: NEVER write "line1;\\nline2;" - this will cause syntax errors!
- Think of it like writing code in a text editor, not escaping for display

Example (single line):
  return await fetch('https://api.example.com').then(r => r.json());

Example (multi-line):
  progress("Starting batch operation...");
  const filesResult = await file({ action: 'list' });
  const files = JSON.parse(filesResult).files;
  for (const f of files) {
    progress(\`Processing \${f.name}\`);
    // process file...
  }
  return { processed: files.length };
`,
      },
    },
    required: ["purpose", "code"],
  };

  // Context injected from conversation
  private convId: string = "";
  private projectId: string = "";
  private userId: string = "";
  private toolsRegistry: Map<string, Tool> = new Map();
  private broadcastFn?: (type: "tool_call" | "tool_result", data: any) => void;
  private currentToolCallId?: string;

  /**
   * Set conversation ID for context
   */
  setConvId(convId: string): void {
    this.convId = convId;
  }

  /**
   * Set project ID for context
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * Set user ID for context
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Inject the tool registry for programmatic access
   */
  setToolsRegistry(tools: Map<string, Tool>): void {
    this.toolsRegistry = tools;
  }

  /**
   * Set broadcast function for progress and sub-tool updates
   */
  setBroadcast(fn: (type: "tool_call" | "tool_result", data: any) => void): void {
    this.broadcastFn = fn;
  }

  /**
   * Set the current tool call ID for tracking
   */
  setToolCallId(id: string): void {
    this.currentToolCallId = id;
  }

  /**
   * Check if result is too large and truncate if needed
   */
  private async handleLargeResult(result: any): Promise<any> {
    // Get max result size from env (default 50KB)
    const maxSize = parseInt(process.env.SCRIPT_TOOL_MAX_RESULT_SIZE || "50000", 10);

    // Handle undefined or null results - return as-is
    if (result === undefined || result === null) {
      return result;
    }

    // Serialize result to check size
    let serialized: string;
    try {
      serialized = JSON.stringify(result);
    } catch (error: any) {
      // If serialization fails (circular refs, etc), return as-is
      console.warn(`[ScriptTool] Could not serialize result for size check: ${error.message}`);
      return result;
    }

    const size = Buffer.byteLength(serialized, "utf8");

    // If under limit, return as-is
    if (size <= maxSize) {
      return result;
    }

    // Result is too large - store it and return truncated version
    console.log(`[ScriptTool] Result too large (${size} bytes > ${maxSize} bytes), storing and truncating...`);

    const metadata = await storeOutput(result, this.convId, this.currentToolCallId!);

    // Create truncated summary based on data type
    let truncatedData: any;
    let summary: string;

    if (Array.isArray(result)) {
      // For arrays: show first N items
      const itemsToShow = Math.floor(maxSize / (size / result.length));
      truncatedData = result.slice(0, itemsToShow);
      summary = `[Array truncated: showing ${itemsToShow} of ${result.length} items]`;
    } else if (typeof result === "string") {
      // For strings: show beginning
      const charsToShow = Math.floor(maxSize / 2); // Rough estimate
      truncatedData = result.substring(0, charsToShow) + "...";
      summary = `[String truncated: showing ${charsToShow} of ${result.length} characters]`;
    } else if (typeof result === "object" && result !== null) {
      // For objects: show structure with sample keys
      const keys = Object.keys(result);
      const keysToShow = Math.min(5, keys.length);
      truncatedData = {};
      for (let i = 0; i < keysToShow; i++) {
        const key = keys[i];
        if (key !== undefined) {
          truncatedData[key] = (result as Record<string, any>)[key];
        }
      }
      summary = `[Object truncated: showing ${keysToShow} of ${keys.length} keys]`;
    } else {
      // For primitives: shouldn't happen but handle it
      truncatedData = result;
      summary = "";
    }

    return {
      _truncated: true,
      _outputId: metadata.id,
      _totalSize: size,
      _totalSizeFormatted: this.formatBytes(size),
      _dataType: metadata.dataType,
      _rowCount: metadata.rowCount,
      _summary: summary,
      _message: `Output was too large (${this.formatBytes(size)}) and has been stored. Use peek('${metadata.id}', offset, limit) in a new script to retrieve specific portions of the data.`,
      data: truncatedData,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  /**
   * Execute TypeScript code in controlled scope
   */
  async execute(args: { purpose: string; code: string }): Promise<any> {
    if (!this.broadcastFn || !this.currentToolCallId) {
      throw new Error("Script tool not properly configured. Missing broadcast or toolCallId.");
    }

    // Broadcast executing state
    this.broadcastFn("tool_call", {
      toolCallId: this.currentToolCallId,
      toolName: "script",
      args,
      status: "executing",
      result: {
        purpose: args.purpose,
        code: args.code
      },
    });

    // Helper to fix literal escape sequences
    const fixEscapeSequences = (code: string): string => {
      return code
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r");
    };

    try {
      // Load extensions
      const extensionLoader = new ExtensionLoader();

      // Initialize extensions for project if needed (copies defaults to project folder)
      // This ensures extensions are available even if user hasn't opened Extensions page yet
      try {
        await extensionLoader.initializeProject(this.projectId);
      } catch (error) {
        // Log but don't fail script execution if initialization fails
        console.warn(`[ScriptTool] Extension initialization failed (non-critical):`, error);
      }

      const extensions = await extensionLoader.loadExtensions(this.projectId);

      // Create runtime with injected context and extensions
      const runtime = new ScriptRuntime({
        convId: this.convId,
        projectId: this.projectId,
        userId: this.userId,
        tools: this.toolsRegistry,
        broadcast: this.broadcastFn,
        toolCallId: this.currentToolCallId,
        purpose: args.purpose,
        code: args.code,
        extensions,
      });

      // Try executing as-is first
      let result: any;
      try {
        result = await runtime.execute(args.code);
      } catch (firstError: any) {
        // If we get "Invalid escape" error and code has \n, try fixing it
        if (firstError.message?.includes("Invalid escape") && args.code.includes("\\n")) {
          console.warn("[ScriptTool] Execution failed with 'Invalid escape' error");
          console.warn("[ScriptTool] Code contains literal \\n - retrying with escape sequence fix");
          console.warn("[ScriptTool] Original code (first 200 chars):", args.code.substring(0, 200));

          const fixedCode = fixEscapeSequences(args.code);
          console.log("[ScriptTool] Fixed code (first 200 chars):", fixedCode.substring(0, 200));

          // Create new runtime with fixed code
          const retryRuntime = new ScriptRuntime({
            convId: this.convId,
            projectId: this.projectId,
            userId: this.userId,
            tools: this.toolsRegistry,
            broadcast: this.broadcastFn,
            toolCallId: this.currentToolCallId,
            purpose: args.purpose,
            code: fixedCode,
            extensions,
          });

          result = await retryRuntime.execute(fixedCode);
        } else {
          // Re-throw if it's not an escape sequence issue
          throw firstError;
        }
      }

      // Check if runtime returned an error object
      if (result && result.error) {
        throw new Error(result.error);
      }

      // Handle large results - store and truncate if needed
      result = await this.handleLargeResult(result);

      // Broadcast complete state
      this.broadcastFn("tool_call", {
        toolCallId: this.currentToolCallId,
        toolName: "script",
        args,
        status: "complete",
        result,
      });

      // Return result directly without extra nesting
      return result;
    } catch (error: any) {
      const errorResult = {
        __error: true,
        error: error.message,
        purpose: args.purpose,
      };

      // Broadcast error state
      this.broadcastFn("tool_call", {
        toolCallId: this.currentToolCallId,
        toolName: "script",
        args,
        status: "error",
        result: errorResult,
      });

      // Return error result instead of throwing to prevent hanging
      return errorResult;
    }
  }
}
