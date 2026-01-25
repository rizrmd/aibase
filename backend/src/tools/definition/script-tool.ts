import { Tool } from "../../llm/conversation";
import { ScriptRuntime, context as scriptRuntimeContext } from "../script-runtime/script-runtime";
import { storeOutput } from "../script-runtime/output-storage";
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
 * - imageDocument.extractText(options) for extracting text from images (OCR)
 *   Options: { filePath?, fileId?, prompt? }
 *   Use this for PNG/JPG images, NOT pdfReader
 * - convId, projectId, and CURRENT_UID for context
 * - console for debugging
 * - fetch for HTTP requests
 */
export class ScriptTool extends Tool {
  name = "script";

  description = `Execute Bun TypeScript code with programmatic access to other tools.
Use for batch operations, complex workflows, data transformations, SQL queries, database operations, PDF text extraction, and image OCR.
Available functions: progress(message, data?), memory.read(category, key), duckdb(options), postgresql(options), clickhouse(options), trino(options), pdfReader(options), imageDocument.extractText(options), showChart(options), showTable(options), showMermaid(options), and all registered tools as async functions.
IMPORTANT: Use imageDocument.extractText() for OCR on PNG/JPG images, NOT pdfReader (pdfReader is only for PDF files).
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

File write/read/peek examples (create, read, and paginate through files):
  // Write content to a file
  await file({ action: 'write', path: 'output.txt', content: 'Hello World' });
  return { success: true };

  // Write JSON data to a file
  const data = { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] };
  await file({ action: 'write', path: 'users.json', content: JSON.stringify(data, null, 2) });
  return { written: data.users.length };

  // Read file (returns up to 8000 chars ~2000 tokens)
  const result = JSON.parse(await file({ action: 'read', path: 'data.json' }));
  return { content: result.content, truncated: result.truncated };

  // Peek at large file with pagination
  const page1 = JSON.parse(await file({ action: 'peek', path: 'large.log', offset: 0, limit: 1000 }));
  const page2 = JSON.parse(await file({ action: 'peek', path: 'large.log', offset: page1.nextOffset, limit: 1000 }));
  return { page1: page1.content, page2: page2.content, hasMore: page2.hasMore };

DuckDB query examples (read CSV/Excel/Parquet files):
  // Query a CSV file
  const data = await duckdb({
    query: "SELECT * FROM 'data.csv' WHERE age > 25 LIMIT 10"
  });
  return { rows: data.rowCount, results: data.data };

  // Read Excel with range (IMPORTANT: range required for multi-column files!)
  const excel = await duckdb({
    query: "SELECT * FROM read_xlsx('report.xlsx', header=true, all_varchar=true, range='A1:Z1000') WHERE revenue IS NOT NULL LIMIT 20"
  });
  return excel.data;

  // Excel with aggregation (cast to numeric when needed)
  const summary = await duckdb({
    query: "SELECT category, SUM(CAST(amount AS DOUBLE)) as total FROM read_xlsx('sales.xlsx', header=true, all_varchar=true, range='A1:F500') GROUP BY category"
  });
  return summary.data;

  // Join multiple files
  const result = await duckdb({
    query: "SELECT a.name, b.score FROM 'users.csv' a JOIN 'scores.parquet' b ON a.id = b.user_id"
  });
  return result.data;

PostgreSQL query examples (RECOMMENDED: store credentials in memory):
  // FIRST TIME: Store credentials in memory (do this once):
  await memory({
    action: 'set',
    category: 'database',
    key: 'postgresql_url',
    value: 'postgresql://user:pass@localhost:5432/mydb'
  });

  // Then use memory.read() to get the credential (CLEAR and type-safe):
  const users = await postgresql({
    query: "SELECT * FROM users WHERE active = true LIMIT 10",
    connectionUrl: memory.read('database', 'postgresql_url')  // Function call - type-safe!
  });
  progress(\`Found \${users.rowCount} users\`);
  return users.data;

  // Query with aggregation (using memory.read())
  const stats = await postgresql({
    query: "SELECT status, COUNT(*) as count FROM orders GROUP BY status",
    connectionUrl: memory.read('database', 'postgresql_url')
  });
  return stats.data;

  // Query with timeout (using memory.read())
  const large = await postgresql({
    query: "SELECT * FROM large_table",
    connectionUrl: memory.read('database', 'postgresql_url'),
    timeout: 60000 // 60 seconds
  });
  return { rowCount: large.rowCount, executionTime: large.executionTime };

PDF reader examples (extract text from PDF files):
  // Read entire PDF
  const pdf = await pdfReader({
    filePath: "document.pdf"
  });
  progress(\`Extracted \${pdf.totalPages} pages\`);
  return { text: pdf.text, pages: pdf.totalPages };

  // RECOMMENDED: For password-protected PDFs, store password in memory (do this once):
  await memory({
    action: 'set',
    category: 'credentials',
    key: 'pdf_password',
    value: 'secret123'
  });

  // Then use memory.read() to get the password (CLEAR and type-safe):
  const secure = await pdfReader({
    filePath: "secure.pdf",
    password: memory.read('credentials', 'pdf_password')  // Function call - type-safe!
  });
  return secure.text;

  // Read first 5 pages only
  const preview = await pdfReader({
    filePath: "long-document.pdf",
    maxPages: 5
  });
  return { preview: preview.text, totalPages: preview.totalPages };

  // Process multiple PDFs
  const files = await file({ action: 'list' });
  const pdfFiles = files.filter(f => f.name.endsWith('.pdf'));
  const results = [];
  for (const pdf of pdfFiles) {
    progress(\`Processing \${pdf.name}\`);
    const content = await pdfReader({ filePath: pdf.name });
    results.push({ file: pdf.name, pages: content.totalPages, text: content.text });
  }
  return results;

Image OCR examples (extract text from PNG/JPG images):
  // Extract text from image using OCR
  const result = await imageDocument.extractText({
    filePath: "KTP MAYLATUN SARI.png"
  });
  progress(\`Extracted text from image\`);
  return { text: result.description };

  // Extract text by file ID (for uploaded files)
  const ocr = await imageDocument.extractText({
    fileId: "KTP MAYLATUN SARI.png"
  });
  return { description: ocr.description };

  // Extract specific information with custom prompt (recommended!)
  // Use the user's question as the prompt for targeted results
  const nik = await imageDocument.extractText({
    fileId: "KTP MAYLATUN SARI.png",
    prompt: "What is the NIK (16-digit identification number) on this KTP card? Return only the number."
  });
  return { nik: nik.description };`,
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
      // Load project extensions (respect USE_DEFAULT_EXTENSIONS flag)
      const extensionLoader = new ExtensionLoader();
      const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';
      const extensions = await extensionLoader.loadExtensions(this.projectId, useDefaults);

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
