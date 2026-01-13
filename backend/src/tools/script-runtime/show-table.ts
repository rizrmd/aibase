/**
 * Context documentation for showTable functionality
 */
export const context = async () => {
  return `### SHOW TABLE

**IMPORTANT: \`showTable\` is a script tool function available in your script execution environment, NOT a direct tool.**

You call \`showTable()\` directly within your TypeScript/JavaScript code - it is NOT invoked via tool use. Just use it like a regular async function.

**CRITICAL: When displaying tabular data to the user, you MUST use showTable() instead of markdown tables.**

Do NOT format data as markdown tables using pipe characters (\`|\`). Always use the \`showTable()\` function for any tabular data you want to display.

**Available:** showTable({ title, description?, columns, data, saveTo? })

#### PARAMETERS

- title: Table title (required)
- description: Optional table description
- columns: Array of column definitions (required)
  - Each column has: key (string), label (string)
- data: Array of data objects (required)
  - Each object's keys should match column keys
- saveTo: Optional filename to save table as PNG (e.g., 'users-table.png')

#### EXAMPLE

\`\`\`typescript
// Simple table
const columns = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
const data = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
await showTable({ title: 'Users', columns, data });

// Table with description and more data
const cols = [
  { key: 'product', label: 'Product' },
  { key: 'price', label: 'Price' },
  { key: 'stock', label: 'In Stock' }
];
const items = [
  { product: 'Laptop', price: '$999', stock: 15 },
  { product: 'Mouse', price: '$25', stock: 150 }
];
await showTable({ title: 'Inventory', description: 'Current product stock', columns: cols, data: items });

// Table with auto-save
await showTable({ title: 'Users', columns, data, saveTo: 'users-table.png' });
return { table: 'displayed' };
\`\`\`

#### WHEN TO USE

- Query results from databases (ClickHouse, DuckDB, PostgreSQL, Trino)
- Any structured data with rows and columns
- Data analysis results
- Report outputs
- ANY tabular data that needs to be displayed to the user

#### WHAT NOT TO DO

\`\`\`typescript
// ❌ WRONG - Do not use markdown tables
const result = \`| ID | Name |\\n|----|------|\\n| 1  | Alice|\`;
return { result };

// ✅ CORRECT - Use showTable
await showTable({
  title: 'Results',
  columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }],
  data: [{ id: 1, name: 'Alice' }]
});
\`\`\``
};

/**
 * Create a showTable function that broadcasts a tool call to the frontend
 */
export function createShowTableFunction(broadcast: (type: "tool_call" | "tool_result", data: any) => void) {
    return async (args: { title: string; description?: string; columns: any[]; data: any[]; saveTo?: string }) => {
        const toolCallId = `call_${Date.now()}_table`;

        // Return data for history persistence (no broadcast - will be included in script result)
        return {
            __visualization: {
                type: "show-table",
                toolCallId,
                args
            }
        };
    };
}
