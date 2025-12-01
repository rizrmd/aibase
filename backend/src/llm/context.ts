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

use todo tool to track step/phases/stages/parts etc. add/remove/check/uncheck multiple time at once instead of one-by-one.

## SCRIPT TOOL - Execute code with fetch, tools, and context!

Use for: API calls, batch operations, complex workflows, data transformations.

**CRITICAL: Code executes as async function BODY. Write like this:**
- ✓ CORRECT: \`return { result: data }\`
- ✓ CORRECT: \`const x = await fetch(url); return x.json()\`
- ✗ WRONG: \`export const x = ...\` (NO export/import!)

**Available:** fetch, duckdb({ query, database?, format?, readonly? }), postgresql({ query, connectionUrl, format?, timeout? }), clickhouse({ query, serverUrl, database?, username?, password?, format?, timeout?, params? }), trino({ query, serverUrl, catalog?, schema?, username?, password?, format?, timeout? }), pdfReader({ filePath?, buffer?, password?, maxPages?, debug? }), webSearch({ search_query, count?, location?, content_size?, search_recency_filter?, search_domain_filter? }), progress(msg), file(...), todo(...), memory(...), convId, projectId, console

## MEMORY TOOL - TWO-LEVEL STRUCTURE:

Memory has TWO levels: [category] -> key: value
- First level: CATEGORY (e.g., "database", "settings", "api_keys")
- Second level: KEY: VALUE pairs within that category

### To use memory tool:
- **SET:** \`memory({ action: "set", category: "database", key: "postgresql_url", value: "postgresql://..." })\`
- **REMOVE KEY:** \`memory({ action: "remove", category: "database", key: "postgresql_url" })\`
- **REMOVE CATEGORY:** \`memory({ action: "remove", category: "database" })\`
- **READ:** Just look at your context! Memory is ALWAYS appended below - you never need to read it.

Write as async function body - NO import/export, just await and return!

{{MEMORY}}

{{TODOS}}
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
 * Replace placeholders in template with dynamic content
 */
function injectDynamicContent(
  template: string,
  memory: MemoryStore | null,
  todoList: TodoList | null
): string {
  let context = template;

  // Replace memory placeholder
  if (memory && Object.keys(memory).length > 0) {
    const memoryContent = formatMemoryForContext(memory);
    context = context.replace("{{MEMORY}}", memoryContent);
  } else {
    context = context.replace("{{MEMORY}}", "");
  }

  // Replace todos placeholder
  if (todoList && todoList.items.length > 0) {
    const todosContent = formatTodosForContext(todoList);
    context = context.replace("{{TODOS}}", todosContent);
  } else {
    context = context.replace("{{TODOS}}", "");
  }

  return context;
}

/**
 * Get default context with existing todos and memory appended
 */
export const defaultContext = async (
  convId: string,
  projectId: string
): Promise<string> => {
  // Load the context template from per-project markdown file
  const template = await loadContextTemplate(projectId);

  // Load project memory (shared across all conversations)
  const memory = await loadMemory(projectId);

  // Load conversation-specific todos (currently disabled)
  // const todoList = await loadTodos(convId, projectId);
  const todoList = null;

  // Inject dynamic content into template
  const context = injectDynamicContent(template, memory, todoList);

  return context;
};
