/**
 * PostgreSQL Extension UI Component
 * Displays query results and details in the inspector
 */

import React from 'react';

interface InspectorProps {
  data: {
    query?: string;
    executionTime?: number;
    rowCount?: number;
    columns?: string[];
    sampleData?: any[];
  };
  error?: string;
}

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

  const { query, executionTime, rowCount, columns, sampleData } = data;

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

      {/* Info Message */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
        🎉 This UI is loaded from backend extension folder and bundled with esbuild!
      </div>
    </div>
  );
}
