/**
 * Show Chart Extension UI Components
 * Displays interactive charts using ECharts
 */

import React from 'react';

interface ChartSeries {
  name: string;
  data: number[] | number;
}

interface InspectorProps {
  data: {
    title?: string;
    description?: string;
    chartType?: 'bar' | 'line' | 'pie' | 'scatter';
    xAxis?: string[];
    yAxis?: string;
    series?: ChartSeries[];
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      args: {
        title?: string;
        description?: string;
        chartType?: 'bar' | 'line' | 'pie' | 'scatter';
        xAxis?: string[];
        yAxis?: string;
        series?: ChartSeries[];
      };
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function ShowChartInspector({ data, error }: InspectorProps) {
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
        No chart data available
      </div>
    );
  }

  const { title, description, chartType, xAxis, yAxis, series } = data;

  if (!series || series.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No chart data available
      </div>
    );
  }

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

      {/* Chart Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-semibold">Type:</span>{' '}
          <span className="text-muted-foreground">{chartType}</span>
        </div>
        {yAxis && (
          <div>
            <span className="font-semibold">Y-Axis:</span>{' '}
            <span className="text-muted-foreground">{yAxis}</span>
          </div>
        )}
      </div>

      {/* Data Summary */}
      {series && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Data Series</h4>
          <div className="space-y-2">
            {series.map((s, idx) => (
              <div key={idx} className="text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground ml-2">
                  ({Array.isArray(s.data) ? `${s.data.length} points` : `1 value: ${s.data}`})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* X-Axis Labels */}
      {xAxis && xAxis.length > 0 && (
        <div>
          <h4 className="font-semibold text-sm mb-2">X-Axis Labels</h4>
          <div className="flex flex-wrap gap-2">
            {xAxis.map((label, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Info Badge */}
      <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded text-xs text-orange-800 dark:text-orange-200">
        📈 Chart - Interactive visualization (use chat for rendering)
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 *
 * Note: This is a placeholder that shows chart metadata.
 * The actual chart rendering happens in the frontend visualization component.
 */
export function ShowChartMessage({ toolInvocation }: MessageProps) {
  const { title, description, chartType, xAxis, yAxis, series } = toolInvocation.result.args;

  if (!series || series.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
      {/* Title and Description */}
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Chart Metadata */}
      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
        <div>
          <span className="font-medium">Type:</span> {chartType}
        </div>
        {yAxis && (
          <div>
            <span className="font-medium">Y-Axis:</span> {yAxis}
          </div>
        )}
      </div>

      {/* Series Summary */}
      <div className="text-sm text-muted-foreground">
        <span className="font-medium">Series:</span>{' '}
        {series.map(s => s.name).join(', ')}
        {chartType !== 'pie' && xAxis && ` (${xAxis.length} data points)`}
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground italic">
        Chart rendering is handled by the frontend visualization component
      </div>
    </div>
  );
}
