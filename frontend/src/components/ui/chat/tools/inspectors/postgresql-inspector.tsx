/**
 * PostgreSQL Inspector Component
 * Displays detailed query information for PostgreSQL queries
 */

import type { InspectorComponentProps } from "../extension-inspector-registry";

interface PostgreSQLInspectionData {
  query?: string;
  executionTime?: number;
  rowCount?: number;
  columns?: string[];
  sampleData?: any[];
  connectionInfo?: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
  };
}

export function PostgreSQLInspector({ data, error }: InspectorComponentProps) {
  const inspectionData = data as PostgreSQLInspectionData;

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        Error: {error}
      </div>
    );
  }

  if (!inspectionData) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No inspection data available
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Query Section */}
      {inspectionData.query && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Query</h4>
          <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">
            {inspectionData.query}
          </pre>
        </div>
      )}

      {/* Execution Statistics */}
      {(inspectionData.executionTime !== undefined || inspectionData.rowCount !== undefined) && (
        <div className="grid grid-cols-2 gap-4">
          {inspectionData.executionTime !== undefined && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Execution Time</h4>
              <p className="text-sm">
                {inspectionData.executionTime < 1000
                  ? `${inspectionData.executionTime}ms`
                  : `${(inspectionData.executionTime / 1000).toFixed(2)}s`}
              </p>
            </div>
          )}
          {inspectionData.rowCount !== undefined && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Rows Returned</h4>
              <p className="text-sm">{inspectionData.rowCount.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Columns */}
      {inspectionData.columns && inspectionData.columns.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Columns</h4>
          <div className="flex flex-wrap gap-2">
            {inspectionData.columns.map((col, idx) => (
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
      {inspectionData.sampleData && inspectionData.sampleData.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Sample Data (First 3 rows)</h4>
          <div className="overflow-auto max-h-40 border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  {Object.keys(inspectionData.sampleData[0]).map((key) => (
                    <th key={key} className="px-2 py-1 text-left font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspectionData.sampleData.map((row, idx) => (
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

      {/* Connection Info */}
      {inspectionData.connectionInfo && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Connection</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            {inspectionData.connectionInfo.host && (
              <div>Host: {inspectionData.connectionInfo.host}</div>
            )}
            {inspectionData.connectionInfo.port && (
              <div>Port: {inspectionData.connectionInfo.port}</div>
            )}
            {inspectionData.connectionInfo.database && (
              <div>Database: {inspectionData.connectionInfo.database}</div>
            )}
            {inspectionData.connectionInfo.user && (
              <div>User: {inspectionData.connectionInfo.user}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
