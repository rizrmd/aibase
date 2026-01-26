/**
 * Peek Extension UI Components
 * Displays paginated access to large stored outputs
 */

import React from 'react';

interface PeekMetadata {
  totalSize: number;
  dataType: string;
  rowCount?: number;
  requestedOffset: number;
  requestedLimit: number;
  actualReturned: number;
  hasMore: boolean;
}

interface OutputMetadata {
  size: number;
  dataType: string;
  rowCount?: number;
}

interface InspectorProps {
  data: {
    outputId?: string;
    data?: unknown[] | string | Record<string, unknown>;
    metadata?: PeekMetadata;
    info?: OutputMetadata;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    toolName?: string;
    result: {
      outputId?: string;
      data?: unknown[] | string | Record<string, unknown>;
      metadata?: PeekMetadata;
      info?: OutputMetadata;
    };
  };
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function PeekInspector({ data, error }: InspectorProps) {
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
        No peek data available
      </div>
    );
  }

  const { outputId, data: peekData, metadata, info } = data;

  // Determine if this is peek() or peekInfo() result
  const isPeekResult = metadata !== undefined;

  return (
    <div className="p-4 space-y-4">
      {/* Output ID */}
      {outputId && (
        <div>
          <h4 className="font-semibold text-sm mb-1">Output ID</h4>
          <p className="text-xs text-muted-foreground font-mono break-all">{outputId}</p>
        </div>
      )}

      {/* Peek Metadata */}
      {isPeekResult && metadata && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Pagination Info</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Data Type: </span>
              <span className="font-mono">{metadata.dataType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Size: </span>
              <span className="font-mono">{formatBytes(metadata.totalSize)}</span>
            </div>
            {metadata.rowCount !== undefined && (
              <div>
                <span className="text-muted-foreground">Total Rows: </span>
                <span className="font-mono">{metadata.rowCount.toLocaleString()}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Offset: </span>
              <span className="font-mono">{metadata.requestedOffset.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Limit: </span>
              <span className="font-mono">{metadata.requestedLimit.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Returned: </span>
              <span className="font-mono">{metadata.actualReturned.toLocaleString()}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Has More: </span>
              <span className={`font-semibold ${metadata.hasMore ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                {metadata.hasMore ? 'Yes - Use peek with higher offset' : 'No - This is the last page'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* PeekInfo Metadata */}
      {!isPeekResult && info && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Output Info</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Data Type: </span>
              <span className="font-mono">{info.dataType}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Size: </span>
              <span className="font-mono">{formatBytes(info.size)}</span>
            </div>
            {info.rowCount !== undefined && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Total Rows: </span>
                <span className="font-mono">{info.rowCount.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Display */}
      {peekData !== undefined && (
        <div>
          <h4 className="font-semibold text-sm mb-2">
            {isPeekResult ? 'Page Data' : 'Data'}
          </h4>
          {typeof peekData === 'string' ? (
            <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap break-all">
              {peekData}
            </pre>
          ) : Array.isArray(peekData) ? (
            <div className="overflow-auto max-h-96 border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {peekData.length > 0 && typeof peekData[0] === 'object' && peekData[0] !== null ? (
                      Object.keys(peekData[0] as object).map((key) => (
                        <th
                          key={key}
                          className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {key}
                        </th>
                      ))
                    ) : (
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground">Value</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {peekData.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="border-t hover:bg-muted/50">
                      {typeof row === 'object' && row !== null ? (
                        Object.values(row).map((value, vIdx) => (
                          <td key={vIdx} className="px-2 py-1">
                            {String(value ?? 'NULL')}
                          </td>
                        ))
                      ) : (
                        <td className="px-2 py-1">{String(row)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {peekData.length > 50 && (
                <div className="p-2 text-xs text-center text-muted-foreground bg-muted">
                  Showing first 50 of {peekData.length} rows in this page
                </div>
              )}
            </div>
          ) : typeof peekData === 'object' && peekData !== null ? (
            <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-96">
              {JSON.stringify(peekData, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">{String(peekData)}</p>
          )}
        </div>
      )}

      {/* Info Badge */}
      <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
        🔍 Peek - Paginated access to large stored outputs
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function PeekMessage({ toolInvocation }: MessageProps) {
  const { outputId, data: peekData, metadata, info } = toolInvocation.result;
  const isPeekResult = metadata !== undefined;
  const isPeekInfo = toolInvocation.toolName === 'peekInfo';

  if (!peekData && !info) {
    return (
      <div className="text-sm text-muted-foreground">
        No peek data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Output ID */}
      {outputId && (
        <div className="text-xs text-muted-foreground">
          Output: <span className="font-mono">{outputId.slice(0, 20)}...</span>
        </div>
      )}

      {/* Peek Result */}
      {isPeekResult && metadata && (
        <>
          {/* Pagination Stats */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-medium">Type:</span> {metadata.dataType}
            </span>
            {metadata.rowCount !== undefined && (
              <span>
                <span className="font-medium">Total:</span> {metadata.rowCount.toLocaleString()} rows
              </span>
            )}
            <span>
              <span className="font-medium">Showing:</span> {metadata.requestedOffset} - {metadata.requestedOffset + metadata.actualReturned}
            </span>
            {metadata.hasMore && (
              <span className="text-blue-600 dark:text-blue-400">
                More data available
              </span>
            )}
          </div>

          {/* Data Preview */}
          {peekData !== undefined && (
            <div className="overflow-auto max-h-60 border rounded">
              {typeof peekData === 'string' ? (
                <pre className="p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {peekData.slice(0, 1000)}
                  {peekData.length > 1000 && '...'}
                </pre>
              ) : Array.isArray(peekData) ? (
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {peekData.length > 0 && typeof peekData[0] === 'object' && peekData[0] !== null ? (
                        Object.keys(peekData[0] as object).map((key) => (
                          <th
                            key={key}
                            className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap"
                          >
                            {key}
                          </th>
                        ))
                      ) : (
                        <th className="px-2 py-1 text-left font-medium text-muted-foreground">Value</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {peekData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        {typeof row === 'object' && row !== null ? (
                          Object.values(row).map((value, vIdx) => (
                            <td key={vIdx} className="px-2 py-1">
                              {String(value ?? 'NULL')}
                            </td>
                          ))
                        ) : (
                          <td className="px-2 py-1">{String(row)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {peekData.length > 10 && (
                  <div className="p-2 text-xs text-center text-muted-foreground bg-muted">
                    Showing 10 of {peekData.length} rows in this page
                  </div>
                )}
              ) : (
                <pre className="p-2 text-xs font-mono">
                  {JSON.stringify(peekData, null, 2)}
                </pre>
              )}
            </div>
          )}
        </>
      )}

      {/* PeekInfo Result */}
      {isPeekInfo && info && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium">Type:</span> {info.dataType}
          </span>
          <span>
            <span className="font-medium">Size:</span> {formatBytes(info.size)}
          </span>
          {info.rowCount !== undefined && (
            <span>
              <span className="font-medium">Rows:</span> {info.rowCount.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
