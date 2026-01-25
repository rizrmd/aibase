import * as fs from "fs/promises";
import * as path from "path";

interface TodoItem {
  id: string;
  text: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TodoList {
  items: TodoItem[];
  updatedAt: string;
}

interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

interface FileInfo {
  name: string;
  path: string;
  type: string;
  size?: number;
  sizeHuman?: string;
  modified?: string;
  scope?: 'user' | 'public';
}

/**
 * Get the path to the todos file
 */
function getTodosFilePath(convId: string, projectId: string): string {
  return path.join(process.cwd(), "data", projectId, convId, "todos.json");
}

/**
 * Load todos from file
 */
async function loadTodos(
  convId: string,
  projectId: string
): Promise<TodoList | null> {
  const todosPath = getTodosFilePath(convId, projectId);

  try {
    const content = await fs.readFile(todosPath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Format todos for context
 */
function formatTodosForContext(todoList: TodoList): string {
  const total = todoList.items.length;
  const completed = todoList.items.filter((item) => item.checked).length;
  const pending = total - completed;

  let context = `\n\nCurrent TODO list (${pending} pending, ${completed} completed):`;

  if (todoList.items.length === 0) {
    context += "\n- No todos yet";
  } else {
    context +=
      "\n" +
      todoList.items
        .map(
          (item) =>
            `- [${item.checked ? "x" : " "}] ${item.text} (id: ${item.id})`
        )
        .join("\n");
  }

  return context;
}

/**
 * Get the path to the memory file
 */
function getMemoryFilePath(projectId: string): string {
  return path.join(process.cwd(), "data", projectId, "memory.json");
}

/**
 * Load memory from file
 */
async function loadMemory(projectId: string): Promise<MemoryStore | null> {
  const memoryPath = getMemoryFilePath(projectId);

  try {
    const content = await fs.readFile(memoryPath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Format memory for context
 */
function formatMemoryForContext(memory: MemoryStore): string {
  const categories = Object.keys(memory);

  if (categories.length === 0) {
    return "";
  }

  let context = `\n\nProject Memory (shared across all conversations, two-level structure: category -> key: value):`;

  for (const category of categories) {
    const categoryData = memory[category];
    if (!categoryData) continue;

    const keys = Object.keys(categoryData);
    if (keys.length > 0) {
      context += `\n\n[${category}] ← category (first level)`;
      for (const key of keys) {
        const value = categoryData[key];
        const valueStr =
          typeof value === "string" ? value : JSON.stringify(value);
        context += `\n  ${key}: ${valueStr} ← key: value (second level)`;
      }
    }
  }

  return context;
}

/**
 * Default context template content
 */
const DEFAULT_TEMPLATE = `# AI Assistant Context

{{TOOL_CONTEXT}}

`;

/**
 * Get the path to the context template file for a project
 */
function getContextTemplatePath(projectId: string): string {
  // Store context per-project in data directory
  return path.join(process.cwd(), "data", projectId, "context.md");
}

/**
 * Ensure the context template file exists, create it with default content if missing
 */
async function ensureContextTemplate(projectId: string): Promise<void> {
  const templatePath = getContextTemplatePath(projectId);
  const projectDir = path.dirname(templatePath);

  try {
    // Check if file exists
    await fs.access(templatePath);
  } catch (error: any) {
    // File doesn't exist, create it
    console.log(`Context template not found at ${templatePath}, creating default template...`);

    try {
      // Ensure project directory exists
      await fs.mkdir(projectDir, { recursive: true });

      // Write default template
      await fs.writeFile(templatePath, DEFAULT_TEMPLATE, "utf-8");
      console.log(`Created default context template at ${templatePath}`);
    } catch (writeError: any) {
      console.error("Failed to create context template:", writeError);
      throw writeError;
    }
  }
}

/**
 * Load context template from file
 */
async function loadContextTemplate(projectId: string): Promise<string> {
  const templatePath = getContextTemplatePath(projectId);

  // Ensure template exists before loading
  await ensureContextTemplate(projectId);

  try {
    const content = await fs.readFile(templatePath, "utf-8");
    return content;
  } catch (error: any) {
    console.error("Failed to load context template:", error);
    // Fallback to default template if reading fails
    return DEFAULT_TEMPLATE;
  }
}

/**
 * Load tool examples from tool definition files
 */
async function loadToolExamples(): Promise<string> {
  try {
    // Import context functions from tool definition files
    const scriptTool = await import("../tools/definition/script-tool");
    const fileTool = await import("../tools/definition/file-tool");
    const todoTool = await import("../tools/definition/todo-tool");
    const memoryTool = await import("../tools/definition/memory-tool");

    // Combine all tool examples in logical order
    const examples: string[] = [];

    // Script tool examples (most comprehensive)
    if (scriptTool.context) {
      examples.push(await scriptTool.context());
    }

    // File tool examples
    if (fileTool.context) {
      examples.push(await fileTool.context());
    }

    // Todo tool examples
    if (todoTool.context) {
      examples.push(await todoTool.context());
    }

    // Memory tool examples
    if (memoryTool.context) {
      examples.push(await memoryTool.context());
    }

    // Join all examples with newlines
    return examples.join("\n\n");
  } catch (error) {
    console.error("Failed to load tool examples:", error);
    return "";
  }
}

/**
 * Replace placeholders in template with dynamic content
 */
async function injectDynamicContent(
  template: string,
  memory: MemoryStore | null,
  todoList: TodoList | null,
  urlParams: Record<string, string> | null = null
): Promise<string> {
  let context = template;

  // Replace URL parameter placeholders (support both {{param}} and ${param})
  if (urlParams && Object.keys(urlParams).length > 0) {
    console.log(`[Context] URL Parameters received:`, urlParams);
    for (const [key, value] of Object.entries(urlParams)) {
      // Try ${param} format first
      let placeholder = `${key}`;
      context = context.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);

      // Also support {{param}} format
      placeholder = `{{${key}}}`;
      context = context.replace(new RegExp(placeholder, 'g'), value);

      console.log(`[Context] Replaced ${key} = ${value}`);
    }
  } else {
    console.log(`[Context] No URL parameters provided`);
  }

  // Replace tool context placeholder
  const toolContext = await loadToolExamples();
  context = context.replace("{{TOOL_CONTEXT}}", toolContext);

  // Append memory if it exists
  if (memory && Object.keys(memory).length > 0) {
    const memoryContent = formatMemoryForContext(memory);
    context += memoryContent;
  }

  // Append todos if they exist
  if (todoList && todoList.items.length > 0) {
    const todosContent = formatTodosForContext(todoList);
    context += todosContent;
  }

  return context;
}

/**
 * Get the path to the files directory for a conversation
 */
function getFilesDirectory(convId: string, projectId: string): string {
  return path.join(process.cwd(), "data", "projects", projectId, "conversations", convId, "files");
}

/**
 * Load files for a conversation
 */
async function loadFiles(
  convId: string,
  projectId: string
): Promise<FileInfo[] | null> {
  const filesDir = getFilesDirectory(convId, projectId);

  try {
    const entries = await fs.readdir(filesDir, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      // Skip metadata files and directories
      if (entry.name.startsWith('.') || entry.isDirectory()) {
        continue;
      }

      const fullPath = path.join(filesDir, entry.name);
      const stats = await fs.stat(fullPath);

      // Load metadata to get scope info
      let scope: 'user' | 'public' = 'user';
      const metaPath = path.join(filesDir, `.${entry.name}.meta.md`);
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const frontmatterMatch = metaContent.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch && frontmatterMatch[1]) {
          const scopeMatch = frontmatterMatch[1].match(/scope:\s*["']?(user|public)["']?/);
          if (scopeMatch) {
            scope = scopeMatch[1] as 'user' | 'public';
          }
        }
      } catch {
        // No metadata file, use default
      }

      files.push({
        name: entry.name,
        path: entry.name,
        type: entry.name.split('.').pop() || 'unknown',
        size: stats.size,
        sizeHuman: formatBytes(stats.size),
        modified: stats.mtime.toISOString(),
        scope,
      });
    }

    // Sort by modified date (newest first)
    files.sort((a, b) => {
      const dateA = a.modified ? new Date(a.modified).getTime() : 0;
      const dateB = b.modified ? new Date(b.modified).getTime() : 0;
      return dateB - dateA;
    });

    return files;
  } catch (error: any) {
    // Files directory doesn't exist or is invalid
    return null;
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Format files for context
 */
function formatFilesForContext(files: FileInfo[]): string {
  if (files.length === 0) {
    return "\n\n📎 No files uploaded yet in this conversation.";
  }

  let context = `\n\n📎 Available Files (${files.length} total, sorted by newest first)`;

  // Group files by scope
  const publicFiles = files.filter(f => f.scope === 'public');
  const userFiles = files.filter(f => f.scope === 'user');

  if (publicFiles.length > 0) {
    context += `\n\n[Public] - Visible to all users in this conversation:`;
    for (const file of publicFiles) {
      context += `\n  • ${file.name} (${file.sizeHuman}, type: .${file.type})`;
    }
  }

  if (userFiles.length > 0) {
    context += `\n\n[User] - Only visible to you:`;
    for (const file of userFiles) {
      context += `\n  • ${file.name} (${file.sizeHuman}, type: .${file.type})`;
    }
  }

  context += `\n\n💡 To read file content: file({ action: 'read', path: 'filename.ext' })`;
  context += `\n💡 To get file info: file({ action: 'info', path: 'filename.ext' })`;

  return context;
}

/**
 * Get default context with existing todos, memory, and files appended
 *
 * @param convId - Conversation ID
 * @param projectId - Project ID
 * @param urlParams - Optional URL parameters for placeholder replacement (e.g., { hewan: "burung" })
 */
export const defaultContext = async (
  convId: string,
  projectId: string,
  urlParams?: Record<string, string>
): Promise<string> => {
  // Load the context template from per-project markdown file
  const template = await loadContextTemplate(projectId);

  // Load project memory (shared across all conversations)
  const memory = await loadMemory(projectId);

  // Load conversation-specific todos (currently disabled)
  // const todoList = await loadTodos(convId, projectId);
  const todoList = null;

  // Load conversation-specific files
  const files = await loadFiles(convId, projectId);

  // Inject dynamic content into template (URL params, tool context, memory, todos)
  let context = await injectDynamicContent(template, memory, todoList, urlParams || null);

  // Append files if they exist
  if (files && files.length > 0) {
    const filesContent = formatFilesForContext(files);
    context += filesContent;
  }

  return context;
};
