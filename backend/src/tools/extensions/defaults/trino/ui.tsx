/**
 * Trino Extension UI Components
 * Contains both inspection dialog UI and inline message chat UI
 */

import React from 'react';

interface InspectorProps {
  data: {
    query?: string;
    executionTime?: number;
    rowCount?: number;
    columns?: string[];
    sampleData?: any[];
    stats?: {
      state?: string;
      nodes?: number;
      totalSplits?: number;
      completedSplits?: number;
    };
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
      stats?: {
        state?: string;
        nodes?: number;
        totalSplits?: number;
        completedSplits?: number;
      };
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function TrinoInspector({ data, error }: InspectorProps) {
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

  const { query, executionTime, rowCount, columns, sampleData, stats } = data;

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

      {/* Distributed Query Stats */}
      {stats && (stats.state || stats.nodes !== undefined || stats.totalSplits !== undefined) && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Distributed Query Stats</h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {stats.state && (
              <div>
                <span className="text-muted-foreground">State: </span>
                <span className="font-mono">{stats.state}</span>
              </div>
            )}
            {stats.nodes !== undefined && (
              <div>
                <span className="text-muted-foreground">Nodes: </span>
                <span className="font-mono">{stats.nodes}</span>
              </div>
            )}
            {stats.totalSplits !== undefined && (
              <div>
                <span className="text-muted-foreground">Splits: </span>
                <span className="font-mono">{stats.completedSplits || 0}/{stats.totalSplits}</span>
              </div>
            )}
          </div>
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

      {/* Info Badge */}
      <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded text-xs text-purple-800 dark:text-purple-200">
        🚀 Trino - Distributed SQL across multiple data sources
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function TrinoMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;
  const { data, rowCount, executionTime, query, stats } = result;

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
          <span>{executionTime}ms</span>
        )}
        {stats?.nodes && (
          <span>{stats.nodes} nodes</span>
        )}
      </div>

      {/* Distributed query indicator */}
      {stats?.totalSplits && stats.totalSplits > 1 && (
        <div className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
          <span>🔀</span>
          <span>Distributed query ({stats.completedSplits || 0}/{stats.totalSplits} splits)</span>
        </div>
      )}

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
