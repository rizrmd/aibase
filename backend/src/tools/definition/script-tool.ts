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
 * - Web search capabilities via DuckDuckGo
 * - SQL queries on CSV/Excel/Parquet files via DuckDB
 *
 * Available in execution scope:
 * - All registered tools as async functions
 * - progress(message, data?) for status updates
 * - webSearch(options) for DuckDuckGo web searches
 *   Options: { query, region?, safesearch?, timelimit?, maxResults? }
 * - duckdb(options) for SQL queries on data files
 *   Options: { query, database?, format?, readonly? }
 * - postgresql(options) for PostgreSQL database queries
 *   Options: { query, connectionUrl, format?, timeout? }
 *   Note: connectionUrl is required
 * - convId and projectId for context
 * - console for debugging
 * - fetch for HTTP requests
 */
export class ScriptTool extends Tool {
  name = "script";

  description = `Execute TypeScript code with programmatic access to other tools.
Use for batch operations, complex workflows, data transformations, SQL queries, and database operations.
Available functions: progress(message, data?), webSearch(options), duckdb(options), postgresql(options), and all registered tools as async functions.
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

Web search example (uses DuckDuckGo):
  const results = await webSearch({
    query: "latest TypeScript features",
    region: "us-en",
    safesearch: "moderate",
    timelimit: "w",
    maxResults: 5
  });
  return results;

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
  return { rowCount: large.rowCount, executionTime: large.executionTime };`,
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

    // Execute the script - let errors propagate to trigger error hook
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
  }
}
