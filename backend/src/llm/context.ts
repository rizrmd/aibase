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
  return path.join(
    process.cwd(),
    "data",
    projectId,
    convId,
    "todos.json"
  );
}

/**
 * Load todos from file
 */
async function loadTodos(convId: string, projectId: string): Promise<TodoList | null> {
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
    context += "\n" + todoList.items.map((item) =>
      `- [${item.checked ? 'x' : ' '}] ${item.text} (id: ${item.id})`
    ).join("\n");
  }

  return context;
}

/**
 * Get the path to the memory file
 */
function getMemoryFilePath(projectId: string): string {
  return path.join(
    process.cwd(),
    "data",
    projectId,
    "memory.json"
  );
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

  let context = `\n\nProject Memory (shared across all conversations):`;

  for (const category of categories) {
    const categoryData = memory[category];
    if (!categoryData) continue;

    const keys = Object.keys(categoryData);
    if (keys.length > 0) {
      context += `\n\n[${category}]`;
      for (const key of keys) {
        const value = categoryData[key];
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        context += `\n  ${key}: ${valueStr}`;
      }
    }
  }

  return context;
}

/**
 * Get default context with existing todos and memory appended
 */
export const defaultContext = async (convId: string = "default", projectId: string = "default"): Promise<string> => {
  let context = `use todo tool to track step/phases/stages/parts etc. add/remove/check/uncheck multiple time at once instead of one-by-one.

SCRIPT TOOL - Execute code with fetch, tools, and context!
Use for: API calls, batch operations, complex workflows, data transformations.

CRITICAL: Code executes as async function BODY. Write like this:
✓ CORRECT:   return { result: data }
✓ CORRECT:   const x = await fetch(url); return x.json()
✗ WRONG:     export const x = ...  (NO export/import!)

EXAMPLES:

1. FETCH WEATHER:
{
  "purpose": "Get current weather in Cirebon",
  "code": "progress('Fetching...'); const res = await fetch('https://wttr.in/Cirebon?format=j1'); const data = await res.json(); const curr = data.current_condition[0]; return { temp: curr.temp_C + '°C', description: curr.weatherDesc[0].value, humidity: curr.humidity + '%' };"
}

2. GET IP ADDRESS:
{
  "purpose": "Get user's public IP address",
  "code": "progress('Fetching IP...'); const res = await fetch('https://api.ipify.org?format=json'); const data = await res.json(); return { ip: data.ip };"
}

3. BATCH PROCESS FILES:
{
  "purpose": "Count exports in TypeScript files",
  "code": "progress('Listing...'); const files = await file({ action: 'list_project_files' }); const tsFiles = files.filter(f => f.name.endsWith('.ts')); let count = 0; for (const f of tsFiles) { progress(\`Reading \${f.name}\`); const content = await file({ action: 'read_file', path: f.path }); count += (content.match(/export /g) || []).length; } return { analyzed: tsFiles.length, totalExports: count };"
}

4. MULTI-TOOL WORKFLOWS:
{
  "purpose": "Create todos for files",
  "code": "const files = await file({ action: 'list_project_files' }); progress(\`Found \${files.length} files\`); const texts = files.slice(0, 10).map(f => \`Review: \${f.name}\`); await todo({ action: 'add', texts }); return { created: texts.length };"
}

5. WEB SEARCH:
{
  "purpose": "Search for latest AI news",
  "code": "progress('Searching web...'); const results = await webSearch({ query: 'latest AI developments', maxResults: 5, timelimit: 'w' }); return { found: results.length, results: results.map(r => ({ title: r.title, link: r.href, summary: r.body.substring(0, 100) + '...' })) };"
}

6. DUCKDB SQL QUERIES:
{
  "purpose": "Analyze sales data from CSV",
  "code": "progress('Querying sales data...'); const result = await duckdb({ query: \"SELECT category, SUM(amount) as total FROM 'sales.csv' GROUP BY category ORDER BY total DESC\" }); return { categories: result.rowCount, data: result.data };"
}

7. DUCKDB JOIN MULTIPLE FILES:
{
  "purpose": "Join customer and order data",
  "code": "progress('Joining data files...'); const result = await duckdb({ query: \"SELECT c.name, c.email, COUNT(o.id) as orders FROM 'customers.csv' c LEFT JOIN 'orders.parquet' o ON c.id = o.customer_id GROUP BY c.id, c.name, c.email HAVING orders > 5\" }); return { customers: result.rowCount, topCustomers: result.data.slice(0, 10) };"
}

8. DUCKDB READ EXCEL FILES:
{
  "purpose": "Analyze Excel data with specific sheet and range",
  "code": "progress('Reading Excel file...'); const result = await duckdb({ query: \"SELECT * FROM read_xlsx('report.xlsx', sheet='Sales', header=true, all_varchar=true, range='A1:Z1000') WHERE revenue IS NOT NULL LIMIT 20\" }); return { rows: result.rowCount, topSales: result.data };"
}

9. DUCKDB EXCEL SUMMARY:
{
  "purpose": "Summarize Excel data by category",
  "code": "progress('Analyzing Excel data...'); const summary = await duckdb({ query: \"SELECT category, COUNT(*) as count, AVG(CAST(amount AS DOUBLE)) as avg_amount, SUM(CAST(amount AS DOUBLE)) as total FROM read_xlsx('data.xlsx', header=true, all_varchar=true, range='A1:F1000') WHERE category IS NOT NULL GROUP BY category ORDER BY total DESC\" }); return { categories: summary.rowCount, breakdown: summary.data };"
}

10. DUCKDB EXCEL EXPLORE STRUCTURE:
{
  "purpose": "Explore Excel file structure and preview data",
  "code": "progress('Reading Excel structure...'); const structure = await duckdb({ query: \"DESCRIBE SELECT * FROM read_xlsx('data.xlsx', header=false, all_varchar=true, range='A1:Z100')\" }); progress(\`Found \${structure.rowCount} columns\`); const preview = await duckdb({ query: \"SELECT * FROM read_xlsx('data.xlsx', header=false, all_varchar=true, range='A1:Z10')\" }); return { columns: structure.data.map(c => c.column_name), totalColumns: structure.rowCount, preview: preview.data };"
}

Available: fetch, webSearch({ query, region?, safesearch?, timelimit?, maxResults? }), duckdb({ query, database?, format?, readonly? }), progress(msg), file(...), todo(...), memory(...), convId, projectId, console
Note: For Excel files use read_xlsx('file.xlsx', header=true, all_varchar=true, range='A1:Z1000') - IMPORTANT: range parameter is required for multi-column Excel files!
      Without range, only the first column is read. Use all_varchar=true to avoid type errors. Cast to numeric types when needed: CAST(column AS DOUBLE)
Write as async function body - NO import/export, just await and return!`;

  // Try to load project memory (shared across all conversations)
  const memory = await loadMemory(projectId);

  if (memory && Object.keys(memory).length > 0) {
    context += formatMemoryForContext(memory);
  }

  // Try to load conversation-specific todos
  const todoList = await loadTodos(convId, projectId);

  if (todoList && todoList.items.length > 0) {
    context += formatTodosForContext(todoList);
  }

  return context;
};
