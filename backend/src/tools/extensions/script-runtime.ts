import type { Tool } from "../llm/conversation";
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

#### 3. BATCH PROCESS FILES (multi-line - use actual newlines!):
\`\`\`typescript
progress('Listing...');
const filesResult = await file({ action: 'list' });
const files = JSON.parse(filesResult).files;
const tsFiles = files.filter(f => f.name.endsWith('.ts'));
let count = 0;
for (const f of tsFiles) {
  progress(\`Reading \${f.name}\`);
  const contentResult = await file({ action: 'read', path: f.name });
  const content = JSON.parse(contentResult).content;
  count += (content.match(/export /g) || []).length;
}
return { analyzed: tsFiles.length, totalExports: count };
\`\`\`

#### 4. MULTI-TOOL WORKFLOWS:
\`\`\`typescript
const filesResult = await file({ action: 'list' });
const files = JSON.parse(filesResult).files;
progress(\`Found \${files.length} files\`);
const texts = files.slice(0, 10).map(f => \`Review: \${f.name}\`);
await todo({ action: 'add', texts });
return { created: texts.length };
\`\`\`

**Available:** fetch, progress(msg), memory.read(category, key), file(...), todo(...), memory(...), peek(outputId, offset, limit), peekInfo(outputId), webSearch(...), imageSearch(...), showChart(...), showTable(...), showMermaid(...), convertDocument(...), imageDocument(...), convId, projectId, CURRENT_UID (user ID from authentication, empty string "" if not authenticated), console

**FILE ACTIONS:**
- \`file({ action: 'write', path: 'filename.txt', content: '...' })\` - Write/create a file
- \`file({ action: 'read', path: 'filename.txt' })\` - Read file (max 8000 chars ~2000 tokens)
- \`file({ action: 'peek', path: 'file.log', offset: 0, limit: 1000 })\` - Paginated read

**IMAGE OCR (extract text from images):**
- \`imageDocument.extractText({ filePath: 'photo.png' })\` - Extract text from image using OCR
- \`imageDocument.extractText({ fileId: 'KTP MAYLATUN SARI.png' })\` - Extract text from uploaded file
- \`imageDocument.extractText({ fileId: 'photo.png', prompt: 'What is the NIK number?' })\` - Use custom prompt for specific information (recommended!)

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

      // Allow console for debugging
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
