/**
 * PostgreSQL Extension UI Components
 * Contains both inspection dialog UI and inline message chat UI
 */

interface InspectorProps {
  data: {
    query?: string;
    executionTime?: number;
    rowCount?: number;
    columns?: string[];
    sampleData?: any[];
    // Support wrapped user results (e.g., { tables, count })
    data?: any[];
    tables?: any[];
    count?: number;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      data?: any[];
      tables?: any[];
      rowCount?: number;
      count?: number;
      executionTime?: number;
      query?: string;
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function PostgreSQLInspector({ data, error }: InspectorProps) {
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

  const { query, executionTime, rowCount, columns, sampleData, data: resultData, tables, count } = data;

  // Handle both direct extension results and wrapped user results
  const displayData = sampleData || resultData || tables;
  const displayCount = rowCount || count;
  const hasData = displayData && displayData.length > 0;
  const hasColumns = columns && columns.length > 0;

  // Extract columns from data if not explicitly provided
  const displayColumns = hasColumns ? columns : (hasData ? Object.keys(displayData[0]) : []);

  // Debug logging
  console.log('[PostgreSQLInspector] Received data:', data);
  console.log('[PostgreSQLInspector] Display data:', displayData);
  console.log('[PostgreSQLInspector] Display count:', displayCount);

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
      {(executionTime !== undefined || displayCount !== undefined) && (
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
          {displayCount !== undefined && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Rows Returned</h4>
              <p className="text-sm">{displayCount.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Columns */}
      {displayColumns && displayColumns.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Columns</h4>
          <div className="flex flex-wrap gap-2">
            {displayColumns.map((col, idx) => (
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
      {hasData && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Sample Data (First 3 rows)</h4>
          <div className="overflow-auto max-h-40 border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  {displayColumns.map((key) => (
                    <th key={key} className="px-2 py-1 text-left font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayData.slice(0, 3).map((row, idx) => (
                  <tr key={idx} className="border-t">
                    {displayColumns.map((key) => (
                      <td key={key} className="px-2 py-1">
                        {String(row[key] ?? 'NULL')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Message */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
        🎉 This UI is loaded from backend extension folder and bundled with esbuild!
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function PostgreSQLMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;
  const { data, tables, rowCount, count, executionTime, query } = result;

  // Handle both direct extension results and wrapped user results
  const displayData = data || tables;
  const displayCount = rowCount || count;

  if (!displayData || displayData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No results returned
      </div>
    );
  }

  // For inline chat, show simplified table with first 5 rows
  const previewData = displayData.slice(0, 5);
  const columns = Object.keys(previewData[0]);

  return (
    <div className="space-y-2">
      {/* Query snippet */}
      {query && (
        <div className="text-xs text-muted-foreground font-mono">
          {query.length > 100 ? `${query.substring(0, 100)}...` : query}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {displayCount !== undefined && (
          <span>{displayCount.toLocaleString()} rows</span>
        )}
        {executionTime !== undefined && (
          <span>{executionTime}ms</span>
        )}
      </div>

      {/* Preview Table */}
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {columns.map((key) => (
                <th key={key} className="px-2 py-1 text-left font-medium">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, idx) => (
              <tr key={idx} className="border-t">
                {columns.map((key) => (
                  <td key={key} className="px-2 py-1">
                    {String(row[key] ?? 'NULL')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayData.length > 5 && (
        <div className="text-xs text-muted-foreground italic">
          Showing 5 of {displayData.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}
