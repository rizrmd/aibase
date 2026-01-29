import type { Tool } from "../../llm/conversation";
import { peek, peekInfo } from "./shared/peek-output";
import { ProjectStorage } from "../../storage/project-storage";

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

#### 3. MEMORY STORAGE:
\`\`\`typescript
progress('Storing API key...');
await memory({ action: 'set', category: 'api', key: 'openai', value: 'sk-...' });
const key = memory.read('api', 'openai');
return { stored: key.substring(0, 10) + '...' };
\`\`\`

#### 4. TODO LIST:
\`\`\`typescript
progress('Creating tasks...');
await todo({ action: 'add', texts: ['Task 1', 'Task 2', 'Task 3'] });
const list = await todo({ action: 'list' });
return { total: list.items.length };
\`\`\`

**Available built-in functions:**

- **fetch(url, options)** - Make HTTP requests to web URLs only
  - **When to use:** Call external APIs, download data from web services
  - **How to use:** \`const res = await fetch('https://api.example.com/data'); const data = await res.json();\`
  - **Note:** Only works with http/https URLs, NOT for file system paths or backend endpoints
  - **For reading files:** Use project extensions like \`excelDocument.summarize()\` instead

**IMPORTANT:** Project extension functions are also available! See the "## Project Extensions" section below for extension functions like:
- extensionCreator.createOrUpdate() - Create/update staging for extensions
- extensionCreator.modify({ extensionId, instruction }) - Modify staging for an extension
- extensionCreator.finalize({ extensionId }) - Promote staging to active extension
- postgresql() - Query PostgreSQL databases
- duckdb() - Query CSV/Excel/Parquet/JSON files
- webSearch() - Search the web
- And more project-specific extensions

- **progress(message, data)** - Send progress updates to the UI
  - **When to use:** Keep users informed during long-running operations
  - **How to use:** \`progress('Processing data...'); progress('Step 1 of 3');\`
  - **Limit:** 3KB max for data payload (large data gets summarized)
  - **Best practice:** Keep \`message\` short, \`data\` small (numbers, small objects)

- **memory.read(category, key)** - Read stored values synchronously
  - **When to use:** Retrieve credentials, API keys, configuration stored in memory
  - **How to use:** \`const apiKey = memory.read('api', 'openai');\`
  - **Note:** Always use memory.read() for credentials to avoid hardcoding secrets

- **memory({ action, category, key, value })** - Set/remove values
  - **When to use:** Store API keys, database URLs, configuration for later use
  - **How to use:** \`await memory({ action: 'set', category: 'db', key: 'host', value: 'localhost' });\`
  - **Actions:** \`set\`, \`remove\`

- **todo({ action, texts, itemId, text })** - Manage todo list
  - **When to use:** Create task lists, track action items, organize work
  - **How to use:** \`await todo({ action: 'add', texts: ['Task 1', 'Task 2'] });\`
  - **Actions:** \`add\`, \`list\`, \`update\`, \`remove\`, \`clear\`

- **peek(outputId, offset, limit)** - Read large script results in chunks
  - **When to use:** When your script returns data larger than 50KB, it gets stored and returns \`{ _truncated: true, _outputId: '...', _totalSize: number }\` instead of the actual data
  - **How to use:** \`const result = await peek(truncatedResult._outputId, 0, 100);\`
  - **Returns:** \`{ outputId, data, metadata: { totalSize, rowCount, hasMore, ... } }\`
  - **Example:**
    \`\`\`typescript
    // Your script returned huge array
    const hugeResult = await fetchHugeData();
    return hugeResult;  // If > 50KB, gets stored automatically

    // In another script call, read it in chunks:
    const { _outputId } = await previousScriptResult;
    const page1 = await peek(_outputId, 0, 100);    // First 100 items
    const page2 = await peek(_outputId, 100, 100);  // Next 100 items
    console.log(page1.metadata.rowCount);  // Total items in array
    console.log(page1.metadata.hasMore);    // true if more data available
    \`\`\`

- **peekInfo(outputId)** - Get metadata about large output without retrieving data
  - **When to use:** Check size/row count before deciding to read large output
  - **How to use:** \`const info = await peekInfo(_outputId); console.log(info.rowCount, info.sizeFormatted);\`
  - **Returns:** \`{ outputId, totalSize, sizeFormatted, dataType, rowCount, storageType, storedAt }\`

- **convId** - Current conversation ID
  - **When to use:** Logging, debugging, or passing to other functions
  - **How to use:** \`console.log('Processing conversation:', convId);\`

- **projectId** - Current project ID
  - **When to use:** Project-specific operations, logging
  - **How to use:** \`console.log('Working in project:', projectId);\`

- **CURRENT_UID** - Authenticated user ID
  - **When to use:** User-specific operations, access control
  - **How to use:** \`if (CURRENT_UID) { console.log('User:', CURRENT_UID); }\`
  - **Note:** Empty string if not authenticated

- **console** - Server logs
  - **When to use:** Debugging (outputs to server logs only, NOT visible to AI)
  - **How to use:** \`console.log('Debug info:', data);\`
  - **Note:** Use progress() or return values for AI-visible output

**BACKEND DEPENDENCIES:** If the active extension has declared backend dependencies in metadata.json, they are available via the \`deps\` object:
- \`deps.packageName\` - For packages without hyphens (e.g., deps.lodash)
- \`deps['package-name']\` - For packages with hyphens (e.g., deps['csv-parse'])
- Example: \`const { groupBy } = deps.lodash; const { format } = deps['date-fns'];\`

**SECURITY MANDATORY:** NEVER hardcode credentials (API keys, passwords, database URLs) in script code. Always store credentials in memory first, then use \`memory.read('category', 'key')\` to access them securely. Hardcoding credentials exposes secrets and is a security violation.`;
};

/**
 * Context provided to the script execution environment
 */
export interface ScriptContext {
  convId: string;
  projectId: string;
  userId: string;
  tools: Map<string, Tool>;
  broadcast: (type: "tool_call" | "tool_result", data: any) => void;
  toolCallId: string;
  purpose: string;
  code: string;
  extensions?: Record<string, any>; // Extension exports to inject into scope
}

/**
 * Runtime for executing TypeScript code with access to registered tools
 * Uses AsyncFunction for same-process execution with controlled scope
 * Bun handles TypeScript syntax natively in AsyncFunction
 */
export class ScriptRuntime {
  private collectedVisualizations: any[] = [];

  constructor(private context: ScriptContext) {
    // No transpiler needed - Bun handles TypeScript in AsyncFunction natively
  }

  /**
   * Execute TypeScript code in a controlled scope
   */
  async execute(code: string): Promise<any> {
    try {
      // Reset collected visualizations for this execution
      this.collectedVisualizations = [];

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

      // Extract visualizations from the result if present (for direct returns)
      const extractedVisualizations = this.extractVisualizations(result);
      console.log('[ScriptRuntime] Extracted visualizations from result:', extractedVisualizations);

      // Combine collected visualizations (from showChart/showTable/showMermaid calls) with extracted ones
      const allVisualizations = [
        ...this.collectedVisualizations,
        ...extractedVisualizations
      ];
      console.log('[ScriptRuntime] Total collected visualizations:', this.collectedVisualizations.length);
      console.log('[ScriptRuntime] All visualizations to include:', allVisualizations.length);

      // If visualizations were found, include them in the result
      if (allVisualizations.length > 0) {
        const finalResult = {
          ...result,
          __visualizations: allVisualizations
        };
        console.log('[ScriptRuntime] Final result with visualizations:', JSON.stringify(finalResult, null, 2));
        console.log('[ScriptRuntime] __visualizations count:', allVisualizations.length);
        console.log('[ScriptRuntime] __visualizations types:', allVisualizations.map((v: any) => v.type));
        return finalResult;
      }

      console.log('[ScriptRuntime] No visualizations to include, returning original result');
      return result;
    } catch (error: any) {
      console.error('[ScriptRuntime] Execution error:', error);
      throw error;
    }
  }

  /**
   * Extract visualization data from script execution result
   */
  private extractVisualizations(result: any): any[] {
    const visualizations: any[] = [];

    // If result has __visualizations property, use it
    if (result && typeof result === 'object' && result.__visualizations) {
      return Array.isArray(result.__visualizations) ? result.__visualizations : [result.__visualizations];
    }

    // Otherwise, scan the result for __visualization properties
    // This handles cases where the script returns the result of showChart/showTable/showMermaid directly
    if (result && typeof result === 'object' && result.__visualization) {
      visualizations.push(result.__visualization);
    }

    return visualizations;
  }

  /**
   * Build the execution scope with injected tools, functions, and context
   */
  private buildScope(): Record<string, any> {
    // Get tenant_id for the project
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(this.context.projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Set context on globalThis for extensions to access
    (globalThis as any).convId = this.context.convId;
    (globalThis as any).projectId = this.context.projectId;
    (globalThis as any).tenantId = tenantId;

    const scope: Record<string, any> = {
      // Context variables
      convId: this.context.convId,
      projectId: this.context.projectId,
      tenantId: tenantId,
      CURRENT_UID: this.context.userId,

      // Console for debugging (goes to server logs)
      // To show output to AI, return it in your result or use progress()
      console: console,

      // Enable HTTP requests
      fetch: fetch,

      // Inject progress function for status updates
      progress: this.createProgressFunction(),

      // Inject memory object with read function
      memory: this.createMemoryObject(),

      // Inject peek function for accessing stored large outputs
      peek: peek,

      // Inject peekInfo function for getting output metadata
      peekInfo: peekInfo,

      // Inject inspection broadcast function for extensions
      __broadcastInspection: this.createInspectionBroadcastFunction(),

      // Inject visualization collector for extensions (showChart, showTable, showMermaid)
      __registerVisualization: this.createVisualizationCollector(),
    };

    // Inject all registered tools as callable functions
    for (const [name, tool] of this.context.tools) {
      if (name === "script") continue; // Prevent recursive calls
      if (name === "memory") continue; // Prevent overriding memory object with read() method

      scope[name] = this.createToolFunction(name, tool);
    }

    // Inject extension exports into scope
    if (this.context.extensions) {
      Object.assign(scope, this.context.extensions);
      console.log(`[ScriptRuntime] Loaded ${Object.keys(this.context.extensions).length} extension functions`);
    }

    return scope;
  }

  /**
   * Create the progress function for sending status updates
   */
  private createProgressFunction() {
    const MAX_PROGRESS_SIZE = 3 * 1024; // 3KB limit for progress data

    return (message: string, data?: any) => {
      const payload = { message, data };
      let payloadSize = 0;
      let truncatedData = data;

      try {
        payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
      } catch (error) {
        // If serialization fails, send message only
        console.warn('[ScriptRuntime] Could not serialize progress data, sending message only:', error);
        truncatedData = undefined;
      }

      // Check if payload exceeds limit
      if (truncatedData !== undefined && payloadSize > MAX_PROGRESS_SIZE) {
        console.warn(`[ScriptRuntime] Progress data too large (${payloadSize} bytes > ${MAX_PROGRESS_SIZE} bytes), truncating data`);

        // Try to send a summary instead
        try {
          const summary = this.summarizeLargeData(data, payloadSize);
          truncatedData = {
            _truncated: true,
            _originalSize: payloadSize,
            _summary: summary,
          };
        } catch (error) {
          // If summarization fails, send message only
          console.warn('[ScriptRuntime] Could not summarize progress data:', error);
          truncatedData = undefined;
        }
      }

      this.context.broadcast("tool_call", {
        toolCallId: this.context.toolCallId,
        toolName: "script",
        args: { purpose: this.context.purpose, code: this.context.code },
        status: "progress",
        result: { message, data: truncatedData },
      });
    };
  }

  /**
   * Summarize large data for progress updates
   */
  private summarizeLargeData(data: any, size: number): string {
    if (Array.isArray(data)) {
      return `[Array with ${data.length} items, ${this.formatBytes(size)}]`;
    } else if (typeof data === 'string') {
      return `[String with ${data.length} characters, ${this.formatBytes(size)}]`;
    } else if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      return `[Object with ${keys.length} keys, ${this.formatBytes(size)}]`;
    } else {
      return `[${typeof data}, ${this.formatBytes(size)}]`;
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Create the inspection broadcast function for extensions
   * Allows extensions to broadcast inspection data for the UI
   */
  private createInspectionBroadcastFunction() {
    return (extensionId: string, data: any) => {
      this.context.broadcast("tool_call", {
        toolCallId: this.context.toolCallId,
        toolName: "script",
        args: { purpose: this.context.purpose, code: this.context.code },
        status: "inspection",
        result: {
          __inspectionData: {
            extensionId,
            data,
          }
        },
      });
    };
  }

  /**
   * Create the visualization collector function for extensions
   * Allows extensions like showChart/showTable/showMermaid to register visualizations
   */
  private createVisualizationCollector() {
    return (type: string, args: any) => {
      const toolCallId = `${this.context.toolCallId}_${type}_${Date.now()}`;
      const visualization = {
        type,
        toolCallId,
        args
      };
      this.collectedVisualizations.push(visualization);

      console.log(`[ScriptRuntime] Registered visualization: type=${type}, total=${this.collectedVisualizations.length}`);
      // Return the visualization object for backward compatibility
      return { __visualization: visualization };
    };
  }

  /**
   * Create the memory object with read function for accessing stored credentials
   * Also makes memory callable for set/remove actions via the memory tool
   */
  private createMemoryObject() {
    const projectId = this.context.projectId;
    const context = this.context;

    // Get tenant_id for the project
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Create the read function (synchronous)
    const read = (category: string, key: string): any => {
      // Load memory from file synchronously
      const fs = require("fs");
      const path = require("path");

      const memoryPath = path.join(
        process.cwd(),
        "data",
        "projects",
        String(tenantId),
        projectId,
        "memory.json"
      );

      try {
        const content = fs.readFileSync(memoryPath, "utf-8");
        const memory = JSON.parse(content);

        if (!memory[category]) {
          throw new Error(
            `Memory category "${category}" not found. Store it first: await memory({ action: 'set', category: '${category}', key: '${key}', value: '...' })`
          );
        }

        if (!(key in memory[category])) {
          throw new Error(
            `Memory key "${key}" not found in category "${category}". Store it first: await memory({ action: 'set', category: '${category}', key: '${key}', value: '...' })`
          );
        }

        return memory[category][key];
      } catch (error: any) {
        if (error.code === "ENOENT") {
          throw new Error(
            `Memory not initialized. Store a value first: await memory({ action: 'set', category: '${category}', key: '${key}', value: '...' })`
          );
        }
        throw error;
      }
    };

    // Find the memory tool in the tools registry
    const memoryTool = context.tools.get("memory");

    // Create a function that wraps the memory tool
    const memoryFunc = async (args: any) => {
      if (!memoryTool) {
        throw new Error("Memory tool not available");
      }
      // Use createToolFunction to wrap the memory tool
      const toolWrapper = this.createToolFunction("memory", memoryTool);
      return await toolWrapper(args);
    };

    // Add the read method to the function
    (memoryFunc as any).read = read;

    return memoryFunc;
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
