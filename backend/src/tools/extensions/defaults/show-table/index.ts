/**
 * Show Table Extension
 * Display tabular data in the frontend
 */

// Get the visualization collector from global scope (injected by ScriptRuntime)
declare const globalThis: {
  __registerVisualization?: (type: string, args: any) => any;
};

// Type definitions
interface TableColumn {
  key: string;
  label: string;
}

interface ShowTableOptions {
  title: string;
  columns: TableColumn[];
  data: Record<string, unknown>[];
}

interface ShowTableResult {
  __visualization: {
    type: string;
    toolCallId: string;
    args: ShowTableOptions;
  };
}

/**
 * Context documentation for the show-table extension
 */
const context = () =>
  '' +
  '### Show Table Extension' +
  '' +
  'Display tabular data in an interactive table format.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### showTable(options)' +
  'Display an interactive table.' +
  '`' + '`' + '`' + 'typescript' +
  'await showTable({' +
  '  title: "Users",' +
  '  columns: [' +
  '    { key: "id", label: "ID" },' +
  '    { key: "name", label: "Name" },' +
  '    { key: "email", label: "Email" }' +
  '  ],' +
  '  data: [' +
  '    { id: 1, name: "Alice", email: "alice@example.com" },' +
  '    { id: 2, name: "Bob", email: "bob@example.com" }' +
  '  ]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`title\\` (required): Table title' +
  '- \\`columns\\` (required): Array of column definitions with \\`key\\` and \\`label\\`' +
  '- \\`data\\` (required): Array of row objects' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Simple table:**' +
  '`' + '`' + '`' + 'typescript' +
  'const users = await postgresql({' +
  '  query: "SELECT * FROM users LIMIT 10",' +
  '  connectionUrl: memory.read(\'database\', \'postgresql_url\')' +
  '});' +
  '' +
  'await showTable({' +
  '  title: "User List",' +
  '  columns: [' +
  '    { key: "id", label: "ID" },' +
  '    { key: "name", label: "Name" },' +
  '    { key: "email", label: "Email" }' +
  '  ],' +
  '  data: users.data' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '2. **Table from DuckDB query:**' +
  '`' + '`' + '`' + 'typescript' +
  'const sales = await duckdb({' +
  '  query: "SELECT * FROM \'sales.csv\' LIMIT 20"' +
  '});' +
  '' +
  'await showTable({' +
  '  title: "Sales Data",' +
  '  columns: Object.keys(sales.data[0]).map(key => ({ key, label: key.toUpperCase() })),' +
  '  data: sales.data' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '3. **Formatted table:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showTable({' +
  '  title: "Financial Summary",' +
  '  columns: [' +
  '    { key: "category", label: "Category" },' +
  '    { key: "amount", label: "Amount ($)" },' +
  '    { key: "date", label: "Date" }' +
  '  ],' +
  '  data: [' +
  '    { category: "Revenue", amount: 15000, date: "2024-01-15" },' +
  '    { category: "Expense", amount: 8500, date: "2024-01-16" }' +
  '  ]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Tables render interactively in the chat interface' +
  '- Supports sorting and filtering (in the UI)' +
  '- Use after querying data with SQL tools' +
  '- Return the result directly to display the table' +
  '- Each row object must have keys matching the column keys';

/**
 * Show table extension
 */
const showTableExtension = {
  /**
   * Display tabular data
   *
   * Usage:
   * await showTable({
   *   title: 'Users',
   *   columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }],
   *   data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
   * });
   */
  showTable: async (args: ShowTableOptions): Promise<ShowTableResult> => {
    // Register visualization with the script runtime
    if (globalThis.__registerVisualization) {
      return globalThis.__registerVisualization("show-table", args);
    }

    // Fallback for direct usage
    const toolCallId = `call_${Date.now()}_table`;
    return {
      __visualization: {
        type: "show-table",
        toolCallId,
        args
      }
    };
  },
};

return showTableExtension;
