import type { Tool } from "../../llm/conversation";
import { createDuckDBFunction } from "./duckdb";
import { createPostgreSQLFunction } from "./postgresql";
import { createClickHouseFunction } from "./clickhouse";
import { createTrinoFunction } from "./trino";
import { createPDFReaderFunction } from "./pdfreader";
import { createWebSearchFunction, createImageSearchFunction } from "./web-search";
import { createShowChartFunction } from "./show-chart";
import { createShowTableFunction } from "./show-table";
import { peek, peekInfo } from "./peek-output";

/**
 * Context documentation for core script runtime functionality
 */
export const context = async () => {
  return `## SCRIPT TOOL - Execute code with fetch, tools, and context!

Use for: API calls, batch operations, complex workflows, data transformations.

**CRITICAL: Code executes as async function BODY. Write like this:**
- ✓ CORRECT: \`return { result: data }\`
- ✓ CORRECT: \`const x = await fetch(url); return x.json()\`
- ✗ WRONG: \`export const x = ...\` (NO export/import!)

**MULTI-LINE CODE:**
- ALWAYS use actual newline characters in the code string
- NEVER use \\n escape sequences between statements
- Write code naturally with real line breaks, like in a text editor
- Example: Multi-line code should have actual newlines, not \\n characters

### CORE EXAMPLES

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

#### 3. BATCH PROCESS FILES (multi-line - use actual newlines!):
\`\`\`typescript
progress('Listing...');
const files = await file({ action: 'list' });
const tsFiles = files.filter(f => f.name.endsWith('.ts'));
let count = 0;
for (const f of tsFiles) {
  progress(\`Reading \${f.name}\`);
  const content = await file({ action: 'read_file', path: f.path });
  count += (content.match(/export /g) || []).length;
}
return { analyzed: tsFiles.length, totalExports: count };
\`\`\`

#### 4. MULTI-TOOL WORKFLOWS:
\`\`\`typescript
const files = await file({ action: 'list' });
progress(\`Found \${files.length} files\`);
const texts = files.slice(0, 10).map(f => \`Review: \${f.name}\`);
await todo({ action: 'add', texts });
return { created: texts.length };
\`\`\`

**Available:** fetch, progress(msg), file(...), todo(...), memory(...), peek(outputId, offset, limit), peekInfo(outputId), webSearch(...), imageSearch(...), convId, projectId, console`;
};

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
      const AsyncFunction = (async function () { }).constructor as any;
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

      // Inject ClickHouse query function
      clickhouse: this.createClickHouseFunction(),

      // Inject Trino query function
      trino: this.createTrinoFunction(),

      // Inject PDF reader function
      pdfReader: this.createPDFReaderFunction(),

      // Inject web search function
      webSearch: this.createWebSearchFunction(),

      // Inject image search function
      imageSearch: this.createImageSearchFunction(),

      // Inject showChart function
      showChart: this.createShowChartFunction(),

      // Inject showTable function
      showTable: this.createShowTableFunction(),

      // Inject peek function for accessing stored large outputs
      peek: peek,

      // Inject peekInfo function for getting output metadata
      peekInfo: peekInfo,
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
   * Get the ClickHouse query function
   */
  private createClickHouseFunction() {
    // Return the ClickHouse function (requires server URL)
    return createClickHouseFunction();
  }

  /**
   * Get the Trino query function
   */
  private createTrinoFunction() {
    // Return the Trino function (requires server URL)
    return createTrinoFunction();
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
   * Get the image search function
   */
  private createImageSearchFunction() {
    // Return the image search function from the modular implementation
    return createImageSearchFunction();
  }

  /**
   * Get the showChart function
   */
  private createShowChartFunction() {
    return createShowChartFunction(this.context.broadcast);
  }

  /**
   * Get the showTable function
   */
  private createShowTableFunction() {
    return createShowTableFunction(this.context.broadcast);
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
