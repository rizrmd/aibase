/**
 * Show Chart Extension UI Components
 * Displays interactive charts using ECharts (loaded from window.libs)
 */

// Get ReactECharts from window.libs (loaded by frontend)
declare const window: {
  libs: {
    React: any;
    ReactDOM: any;
    ReactECharts: any;
    echarts: any;
    mermaid: any;
  };
};

const ReactECharts = window.libs.ReactECharts;
const echarts = window.libs.echarts;

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
 * Get chart theme based on document class
 */
function getChartTheme(): 'dark' | undefined {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : undefined;
}

/**
 * Build ECharts option from simplified data
 */
function buildChartOption(
  chartType: string,
  data: { series?: ChartSeries[]; xAxis?: string[]; yAxis?: string },
  theme: 'dark' | undefined
) {
  const baseOption: any = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    textStyle: {
      fontFamily: 'Inter, sans-serif',
    },
  };

  if (chartType === 'pie') {
    baseOption.tooltip = {
      trigger: 'item',
    };
    baseOption.series = data.series?.map((s: any) => ({
      ...s,
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2,
      },
      label: {
        show: false,
        position: 'center',
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 20,
          fontWeight: 'bold',
        },
      },
      labelLine: {
        show: false,
      },
    }));
  } else {
    // Line, Bar, etc.
    baseOption.xAxis = {
      type: 'category',
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: theme === 'dark' ? '#525252' : '#e5e5e5',
        },
      },
      axisLabel: {
        color: theme === 'dark' ? '#a3a3a3' : '#525252',
      },
    };
    baseOption.yAxis = {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: theme === 'dark' ? '#262626' : '#f5f5f5',
        },
      },
      axisLabel: {
        color: theme === 'dark' ? '#a3a3a3' : '#525252',
      },
    };
    baseOption.series = data.series?.map((s: any) => ({
      ...s,
      type: chartType,
      smooth: chartType === 'line',
    }));
  }

  return baseOption;
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function ShowChartInspector({ data, error }: InspectorProps) {
  const theme = getChartTheme();

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

  const option = buildChartOption(chartType || 'bar', { series, xAxis, yAxis }, theme);

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

      {/* Chart Rendering */}
      <div className="h-[400px] w-full">
        <ReactECharts
          option={option}
          theme={theme}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
      </div>

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

      {/* Info Badge */}
      <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded text-xs text-orange-800 dark:text-orange-200">
        📈 Chart - Interactive visualization from backend plugin
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function ShowChartMessage({ toolInvocation }: MessageProps) {
  const theme = getChartTheme();
  const { title, description, chartType, xAxis, yAxis, series } = toolInvocation.result.args;

  if (!series || series.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No chart data available
      </div>
    );
  }

  const option = buildChartOption(chartType || 'bar', { series, xAxis, yAxis }, theme);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
      {/* Title and Description */}
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Chart Rendering */}
      <div className="h-[300px] w-full">
        <ReactECharts
          option={option}
          theme={theme}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  );
}
