/**
 * Show Table Extension UI Components
 * Displays tabular data with columns and rows
 */

import React from 'react';

interface TableColumn {
  key: string;
  label: string;
}

interface InspectorProps {
  data: {
    title?: string;
    description?: string;
    columns?: TableColumn[];
    data?: Record<string, unknown>[];
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      args: {
        title?: string;
        description?: string;
        columns?: TableColumn[];
        data?: Record<string, unknown>[];
      };
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function ShowTableInspector({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <h4 className="font-semibold mb-2">Error</h4>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No table data available
      </div>
    );
  }

  const { title, description, columns, data: tableData } = data;

  return (
    <div className="p-4 space-y-4">
      {/* Title and Description */}
      {title && (
        <div>
          <h4 className="font-semibold text-base mb-1">{title}</h4>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {/* Table Stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="font-semibold">Rows:</span>
        <span className="text-muted-foreground">{tableData.length}</span>
        {columns && (
          <>
            <span className="font-semibold">Columns:</span>
            <span className="text-muted-foreground">{columns.length}</span>
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[600px] border rounded">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              {columns?.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, idx) => (
              <tr key={idx} className="border-t hover:bg-muted/50">
                {columns?.map((col) => (
                  <td key={`${idx}-${col.key}`} className="px-4 py-2">
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info Badge */}
      <div className="p-3 bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-800 rounded text-xs text-cyan-800 dark:text-cyan-200">
        📊 Table - Interactive tabular data display
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function ShowTableMessage({ toolInvocation }: MessageProps) {
  const { title, description, columns, data: tableData } = toolInvocation.result.args;

  if (!tableData || tableData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No table data available
      </div>
    );
  }

  // Show all rows in chat (table is compact)
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm overflow-hidden">
      {/* Title and Description */}
      {title && (
        <div className="flex flex-col gap-1">
          <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors hover:bg-muted/50">
              {columns?.map((col) => (
                <th
                  key={col.key}
                  className="h-10 px-2 text-left align-middle font-medium text-muted-foreground"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {tableData.map((row, idx) => (
              <tr
                key={idx}
                className="border-b transition-colors hover:bg-muted/50"
              >
                {columns?.map((col) => (
                  <td
                    key={`${idx}-${col.key}`}
                    className="p-2 align-middle"
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
