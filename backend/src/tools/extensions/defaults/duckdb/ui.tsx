/**
 * DuckDB Extension UI Components
 * Contains both inspection dialog UI and inline message chat UI
 */

interface InspectorProps {
  data: {
    query?: string;
    executionTime?: number;
    rowCount?: number;
    columns?: string[];
    sampleData?: any[];
    databasePath?: string;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      data?: any[];
      rowCount?: number;
      executionTime?: number;
      query?: string;
      databasePath?: string;
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function DuckDBInspector({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <h4 className="font-semibold mb-2">Error</h4>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No inspection data available
      </div>
    );
  }

  const { query, executionTime, rowCount, columns, sampleData, databasePath } = data;

  return (
    <div className="p-4 space-y-4">
      {/* Query Section */}
      {query && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Query</h4>
          <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">
            {query}
          </pre>
        </div>
      )}

      {/* Execution Statistics */}
      {(executionTime !== undefined || rowCount !== undefined) && (
        <div className="grid grid-cols-2 gap-4">
          {executionTime !== undefined && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Execution Time</h4>
              <p className="text-sm">
                {executionTime < 1000
                  ? `${executionTime}ms`
                  : `${(executionTime / 1000).toFixed(2)}s`
                }
              </p>
            </div>
          )}
          {rowCount !== undefined && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Rows Returned</h4>
              <p className="text-sm">{rowCount.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Columns */}
      {columns && columns.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Columns</h4>
          <div className="flex flex-wrap gap-2">
            {columns.map((col, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sample Data */}
      {sampleData && sampleData.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Sample Data (First 3 rows)</h4>
          <div className="overflow-auto max-h-40 border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  {Object.keys(sampleData[0]).map((key) => (
                    <th key={key} className="px-2 py-1 text-left font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleData.map((row, idx) => (
                  <tr key={idx} className="border-t">
                    {Object.values(row).map((value, vIdx) => (
                      <td key={vIdx} className="px-2 py-1">
                        {String(value ?? 'NULL')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Database Info */}
      {databasePath && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Database</h4>
          <p className="text-xs text-muted-foreground font-mono">{databasePath}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function DuckDBMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;
  const { data, rowCount, executionTime, query, databasePath } = result;

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No results returned
      </div>
    );
  }

  // For inline chat, show simplified table with first 5 rows
  const previewData = data.slice(0, 5);

  return (
    <div className="space-y-2">
      {/* Database Path */}
      {databasePath && (
        <div className="text-xs text-muted-foreground font-mono">
          📂 {databasePath}
        </div>
      )}

      {/* Query snippet */}
      {query && (
        <div className="text-xs text-muted-foreground font-mono">
          {query.length > 100 ? `${query.substring(0, 100)}...` : query}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {rowCount !== undefined && (
          <span>{rowCount.toLocaleString()} rows</span>
        )}
        {executionTime !== undefined && (
          <span>{executionTime < 1000
            ? `${executionTime}ms`
            : `${(executionTime / 1000).toFixed(2)}s`
          }</span>
        )}
      </div>

      {/* Preview Table */}
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {Object.keys(previewData[0]).map((key) => (
                <th key={key} className="px-2 py-1 text-left font-medium">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, idx) => (
              <tr key={idx} className="border-t">
                {Object.values(row).map((value, vIdx) => (
                  <td key={vIdx} className="px-2 py-1">
                    {String(value ?? 'NULL')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length > 5 && (
        <div className="text-xs text-muted-foreground italic">
          Showing 5 of {data.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}
