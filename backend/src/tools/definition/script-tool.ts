import { Tool } from "../../llm/conversation";
import { ScriptRuntime } from "../runtime/script-runtime";

/**
 * Context for the Script tool
 */
export const context = async () => {
  return `## SCRIPT TOOL - Execute code with fetch, tools, and context!

Use for: API calls, batch operations, complex workflows, data transformations.

**CRITICAL: Code executes as async function BODY. Write like this:**
- ✓ CORRECT: \`return { result: data }\`
- ✓ CORRECT: \`const x = await fetch(url); return x.json()\`
- ✗ WRONG: \`export const x = ...\` (NO export/import!)

### EXAMPLES

#### 1. FETCH WEATHER:
\`\`\`json
{
  "purpose": "Get current weather in Cirebon",
  "code": "progress('Fetching...'); const res = await fetch('https://wttr.in/Cirebon?format=j1'); const data = await res.json(); const curr = data.current_condition[0]; return { temp: curr.temp_C + '°C', description: curr.weatherDesc[0].value, humidity: curr.humidity + '%' };"
}
\`\`\`

#### 2. GET IP ADDRESS:
\`\`\`json
{
  "purpose": "Get user's public IP address",
  "code": "progress('Fetching IP...'); const res = await fetch('https://api.ipify.org?format=json'); const data = await res.json(); return { ip: data.ip };"
}
\`\`\`

#### 3. BATCH PROCESS FILES:
\`\`\`json
{
  "purpose": "Count exports in TypeScript files",
  "code": "progress('Listing...'); const files = await file({ action: 'list' }); const tsFiles = files.filter(f => f.name.endsWith('.ts')); let count = 0; for (const f of tsFiles) { progress(\`Reading \${f.name}\`); const content = await file({ action: 'read_file', path: f.path }); count += (content.match(/export /g) || []).length; } return { analyzed: tsFiles.length, totalExports: count };"
}
\`\`\`

#### 4. MULTI-TOOL WORKFLOWS:
\`\`\`json
{
  "purpose": "Create todos for files",
  "code": "const files = await file({ action: 'list' }); progress(\`Found \${files.length} files\`); const texts = files.slice(0, 10).map(f => \`Review: \${f.name}\`); await todo({ action: 'add', texts }); return { created: texts.length };"
}
\`\`\`

#### 5. DUCKDB SQL QUERIES:
\`\`\`json
{
  "purpose": "Analyze sales data from CSV",
  "code": "progress('Querying sales data...'); const result = await duckdb({ query: \\"SELECT category, SUM(amount) as total FROM 'sales.csv' GROUP BY category ORDER BY total DESC\\" }); return { categories: result.rowCount, data: result.data };"
}
\`\`\`

#### 6. DUCKDB JOIN MULTIPLE FILES:
\`\`\`json
{
  "purpose": "Join customer and order data",
  "code": "progress('Joining data files...'); const result = await duckdb({ query: \\"SELECT c.name, c.email, COUNT(o.id) as orders FROM 'customers.csv' c LEFT JOIN 'orders.parquet' o ON c.id = o.customer_id GROUP BY c.id, c.name, c.email HAVING orders > 5\\" }); return { customers: result.rowCount, topCustomers: result.data.slice(0, 10) };"
}
\`\`\`

#### 7. DUCKDB READ EXCEL FILES:
\`\`\`json
{
  "purpose": "Analyze Excel data with specific sheet and range",
  "code": "progress('Reading Excel file...'); const result = await duckdb({ query: \\"SELECT * FROM read_xlsx('report.xlsx', sheet='Sales', header=true, all_varchar=true, range='A1:Z1000') WHERE revenue IS NOT NULL LIMIT 20\\" }); return { rows: result.rowCount, topSales: result.data };"
}
\`\`\`

#### 8. DUCKDB EXCEL SUMMARY:
\`\`\`json
{
  "purpose": "Summarize Excel data by category",
  "code": "progress('Analyzing Excel data...'); const summary = await duckdb({ query: \\"SELECT category, COUNT(*) as count, AVG(CAST(amount AS DOUBLE)) as avg_amount, SUM(CAST(amount AS DOUBLE)) as total FROM read_xlsx('data.xlsx', header=true, all_varchar=true, range='A1:F1000') WHERE category IS NOT NULL GROUP BY category ORDER BY total DESC\\" }); return { categories: summary.rowCount, breakdown: summary.data };"
}
\`\`\`

#### 9. DUCKDB EXCEL EXPLORE STRUCTURE:
\`\`\`json
{
  "purpose": "Explore Excel file structure and preview data",
  "code": "progress('Reading Excel structure...'); const structure = await duckdb({ query: \\"DESCRIBE SELECT * FROM read_xlsx('data.xlsx', header=false, all_varchar=true, range='A1:Z100')\\" }); progress(\`Found \${structure.rowCount} columns\`); const preview = await duckdb({ query: \\"SELECT * FROM read_xlsx('data.xlsx', header=false, all_varchar=true, range='A1:Z10')\\" }); return { columns: structure.data.map(c => c.column_name), totalColumns: structure.rowCount, preview: preview.data };"
}
\`\`\`

#### 10. POSTGRESQL QUERY (IMPORTANT - Use postgresql(), NOT DuckDB!):
\`\`\`json
{
  "purpose": "Query PostgreSQL database for active users",
  "code": "progress('Querying PostgreSQL...'); const result = await postgresql({ query: 'SELECT * FROM users WHERE active = true LIMIT 10', connectionUrl: 'postgresql://user:pass@localhost:5432/mydb' }); progress(\`Found \${result.rowCount} users\`); return { count: result.rowCount, users: result.data };"
}
\`\`\`

#### 11. POSTGRESQL WITH AGGREGATION:
\`\`\`json
{
  "purpose": "Get order statistics from PostgreSQL",
  "code": "progress('Analyzing orders...'); const stats = await postgresql({ query: 'SELECT status, COUNT(*) as count, SUM(total) as revenue FROM orders GROUP BY status ORDER BY revenue DESC', connectionUrl: 'postgresql://user:pass@localhost:5432/mydb' }); return { breakdown: stats.data, totalStatuses: stats.rowCount };"
}
\`\`\`

#### 12. POSTGRESQL WITH TIMEOUT:
\`\`\`json
{
  "purpose": "Query PostgreSQL with custom timeout",
  "code": "progress('Querying large table...'); const result = await postgresql({ query: 'SELECT * FROM products WHERE price > 100 ORDER BY price DESC', connectionUrl: 'postgresql://user:pass@localhost:5432/shop', timeout: 60000 }); return { products: result.rowCount, data: result.data };"
}
\`\`\`

#### 13. CLICKHOUSE QUERY (IMPORTANT - Use clickhouse() for ClickHouse databases!):
\`\`\`json
{
  "purpose": "Query ClickHouse database for event analytics",
  "code": "progress('Querying ClickHouse...'); const result = await clickhouse({ query: 'SELECT event_type, COUNT(*) as count FROM events WHERE date >= today() - 7 GROUP BY event_type ORDER BY count DESC LIMIT 10', serverUrl: 'http://localhost:8123', database: 'analytics', username: 'default', password: '' }); progress(\`Found \${result.rowCount} event types\`); return { count: result.rowCount, events: result.data };"
}
\`\`\`

#### 14. CLICKHOUSE WITH AGGREGATION:
\`\`\`json
{
  "purpose": "Get user activity statistics from ClickHouse",
  "code": "progress('Analyzing user activity...'); const stats = await clickhouse({ query: 'SELECT toDate(timestamp) as date, COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_events FROM user_events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY date ORDER BY date', serverUrl: 'http://localhost:8123', database: 'analytics' }); return { days: stats.rowCount, dailyStats: stats.data };"
}
\`\`\`

#### 15. CLICKHOUSE WITH PARAMETERS:
\`\`\`json
{
  "purpose": "Query ClickHouse with parameterized query",
  "code": "progress('Querying with parameters...'); const result = await clickhouse({ query: 'SELECT * FROM users WHERE age > {minAge:UInt8} AND country = {country:String} LIMIT {limit:UInt16}', serverUrl: 'http://localhost:8123', database: 'default', params: { minAge: 25, country: 'US', limit: 100 } }); return { users: result.rowCount, data: result.data };"
}
\`\`\`

#### 16. TRINO QUERY (IMPORTANT - Use trino() for Trino distributed queries!):
\`\`\`json
{
  "purpose": "Query Trino for distributed data analysis",
  "code": "progress('Querying Trino...'); const result = await trino({ query: 'SELECT region, COUNT(*) as count, SUM(revenue) as total_revenue FROM sales WHERE year = 2024 GROUP BY region ORDER BY total_revenue DESC', serverUrl: 'http://localhost:8080', catalog: 'hive', schema: 'default', username: 'trino' }); progress(\`Found \${result.rowCount} regions\`); return { count: result.rowCount, regions: result.data, stats: result.stats };"
}
\`\`\`

#### 17. TRINO CROSS-CATALOG QUERY:
\`\`\`json
{
  "purpose": "Query across multiple data sources with Trino",
  "code": "progress('Running cross-catalog query...'); const result = await trino({ query: 'SELECT h.customer_id, h.order_count, p.customer_name FROM hive.sales.order_summary h JOIN postgresql.crm.customers p ON h.customer_id = p.id WHERE h.order_count > 10', serverUrl: 'http://localhost:8080', catalog: 'hive', schema: 'sales', username: 'trino' }); return { customers: result.rowCount, data: result.data };"
}
\`\`\`

#### 18. TRINO WITH AUTHENTICATION:
\`\`\`json
{
  "purpose": "Query Trino with authentication and custom timeout",
  "code": "progress('Connecting to secured Trino...'); const result = await trino({ query: 'SELECT date_trunc(\\\\'day\\\\', order_date) as day, COUNT(*) as orders FROM orders WHERE order_date >= CURRENT_DATE - INTERVAL \\\\'30\\\\' DAY GROUP BY 1 ORDER BY 1', serverUrl: 'http://localhost:8080', catalog: 'hive', schema: 'warehouse', username: 'user', password: 'secret', timeout: 60000 }); return { days: result.rowCount, orderTrend: result.data };"
}
\`\`\`

#### 19. PDF READER - READ ENTIRE PDF:
\`\`\`json
{
  "purpose": "Extract text from PDF file",
  "code": "progress('Reading PDF...'); const pdf = await pdfReader({ filePath: 'document.pdf' }); progress(\`Extracted \${pdf.totalPages} pages\`); return { text: pdf.text, pages: pdf.totalPages, preview: pdf.text.substring(0, 500) + '...' };"
}
\`\`\`

#### 20. PDF READER - PASSWORD PROTECTED:
\`\`\`json
{
  "purpose": "Read password-protected PDF",
  "code": "progress('Opening encrypted PDF...'); const pdf = await pdfReader({ filePath: 'secure.pdf', password: 'secret123' }); return { text: pdf.text, pages: pdf.totalPages };"
}
\`\`\`

#### 21. PDF READER - LIMITED PAGES:
\`\`\`json
{
  "purpose": "Preview first 3 pages of PDF",
  "code": "progress('Reading preview...'); const pdf = await pdfReader({ filePath: 'report.pdf', maxPages: 3 }); return { preview: pdf.text, pagesRead: pdf.totalPages };"
}
\`\`\`

#### 22. PDF READER - BATCH PROCESS PDFs:
\`\`\`json
{
  "purpose": "Extract text from all PDF files",
  "code": "const files = await file({ action: 'list' }); const pdfs = files.filter(f => f.name.endsWith('.pdf')); const results = []; for (const pdf of pdfs) { progress(\`Processing \${pdf.name}\`); const content = await pdfReader({ filePath: pdf.name }); results.push({ file: pdf.name, pages: content.totalPages, textLength: content.text.length, preview: content.text.substring(0, 200) }); } return { processed: results.length, results };"
}
\`\`\`

**IMPORTANT:** When using pdfReader with files from \`file({ action: 'list' })\`, use ONLY the filename (pdf.name), NOT the full path (pdf.path)!

**Available:** fetch, duckdb({ query, database?, format?, readonly? }), postgresql({ query, connectionUrl, format?, timeout? }), clickhouse({ query, serverUrl, database?, username?, password?, format?, timeout?, params? }), trino({ query, serverUrl, catalog?, schema?, username?, password?, format?, timeout? }), pdfReader({ filePath?, buffer?, password?, maxPages?, debug? }), webSearch({ search_query, count?, location?, content_size?, search_recency_filter?, search_domain_filter? }), progress(msg), file(...), todo(...), memory(...), convId, projectId, console`;
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
