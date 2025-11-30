import { Tool } from "../../llm/conversation";
import { ScriptRuntime } from "../runtime/script-runtime";

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
 *   Options: { query, connectionUrl, format?, timeout? }
 *   Note: connectionUrl is required
 * - pdfReader(options) for extracting text from PDF files
 *   Options: { filePath?, buffer?, password?, maxPages?, debug? }
 * - convId and projectId for context
 * - console for debugging
 * - fetch for HTTP requests
 */
export class ScriptTool extends Tool {
  name = "script";

  description = `Execute TypeScript code with programmatic access to other tools.
Use for batch operations, complex workflows, data transformations, SQL queries, database operations, and PDF text extraction.
Available functions: progress(message, data?), duckdb(options), postgresql(options), pdfReader(options), and all registered tools as async functions.
Context variables: convId, projectId.`;

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
Example:
  progress("Starting batch operation...");
  const files = await file({ action: 'list' });
  for (const f of files) {
    progress(\`Processing \${f.name}\`);
    // process file...
  }
  return { processed: files.length };

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

PostgreSQL query examples (requires direct connection URL):
  // Query users from PostgreSQL
  const users = await postgresql({
    query: "SELECT * FROM users WHERE active = true LIMIT 10",
    connectionUrl: "postgresql://user:pass@localhost:5432/mydb"
  });
  progress(\`Found \${users.rowCount} users\`);
  return users.data;

  // Query with aggregation
  const stats = await postgresql({
    query: "SELECT status, COUNT(*) as count FROM orders GROUP BY status",
    connectionUrl: "postgresql://user:pass@localhost:5432/mydb"
  });
  return stats.data;

  // Query with timeout
  const large = await postgresql({
    query: "SELECT * FROM large_table",
    connectionUrl: "postgresql://user:pass@localhost:5432/mydb",
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

  // Read password-protected PDF
  const secure = await pdfReader({
    filePath: "secure.pdf",
    password: "secret123"
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
  return results;`,
      },
    },
    required: ["purpose", "code"],
  };

  // Context injected from conversation
  private convId: string = "";
  private projectId: string = "";
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

    try {
      // Create runtime with injected context
      const runtime = new ScriptRuntime({
        convId: this.convId,
        projectId: this.projectId,
        tools: this.toolsRegistry,
        broadcast: this.broadcastFn,
        toolCallId: this.currentToolCallId,
        purpose: args.purpose,
        code: args.code,
      });

      // Execute the script
      const result = await runtime.execute(args.code);

      // Check if runtime returned an error object
      if (result && result.error) {
        throw new Error(result.error);
      }

      // Broadcast complete state
      this.broadcastFn("tool_call", {
        toolCallId: this.currentToolCallId,
        toolName: "script",
        args,
        status: "complete",
        result: {
          purpose: args.purpose,
          result,
        },
      });

      // Return success result with purpose
      return {
        purpose: args.purpose,
        result,
        status: "success",
      };
    } catch (error: any) {
      // Broadcast error state
      this.broadcastFn("tool_call", {
        toolCallId: this.currentToolCallId,
        toolName: "script",
        args,
        status: "error",
        result: {
          purpose: args.purpose,
          error: error.message,
        },
      });

      // Return error result instead of throwing to prevent hanging
      return {
        purpose: args.purpose,
        error: error.message,
        status: "error",
      };
    }
  }
}
