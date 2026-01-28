/**
 * Show Chart Extension
 * Display interactive charts in the frontend
 */

import * as fs from 'fs';
import * as path from 'path';

// Get the visualization collector from global scope (injected by ScriptRuntime)
declare const globalThis: {
  __registerVisualization?: (type: string, args: any) => any;
};

// Debug log file
const debugLogPath = path.join(process.cwd(), 'data', 'logs', 'showchart-debug.log');

function debugLog(message: string, data?: any) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = data ? `[${timestamp}] ${message} ${JSON.stringify(data, null, 2)}\n` : `[${timestamp}] ${message}\n`;
    fs.appendFileSync(debugLogPath, logMessage);
  } catch (err) {
    // Ignore logging errors
  }
}

// Type definitions
interface ChartSeries {
  name: string;
  data: number[] | number;
}

interface ShowChartOptions {
  title: string;
  chartType?: 'bar' | 'line' | 'pie' | 'scatter';
  xAxis?: string[];
  yAxis?: string;
  series?: ChartSeries[];
}

// Alternative Chart.js-style format
interface ChartJsOptions {
  title: string;
  type?: 'bar' | 'line' | 'pie' | 'scatter';
  labels?: string[];
  datasets?: Array<{
    label: string;
    data: number[] | number;
    backgroundColor?: string | string[];
  }>;
}

interface ChartVisualizationResult {
  __visualization: {
    type: string;
    toolCallId: string;
    args: ShowChartOptions;
  };
}

/**
 * Convert Chart.js format to internal format
 */
function convertChartJsFormat(options: any): ShowChartOptions {
  const { title, type, chartType, labels, datasets, series, xAxis, yAxis } = options;

  // Check if this is Chart.js format (has datasets)
  if (datasets && Array.isArray(datasets) && datasets.length > 0) {
    const chartSeries: ChartSeries[] = datasets.map((ds: any) => ({
      name: ds.label,
      data: ds.data
    }));

    return {
      title: title || 'Chart',
      chartType: (type || chartType) || 'bar',
      xAxis: labels,
      yAxis: datasets[0]?.label || yAxis || 'Value',
      series: chartSeries
    };
  }

  // Already in internal format
  return {
    title: title || 'Chart',
    chartType: (type || chartType) || 'bar',
    xAxis: labels || xAxis,
    yAxis: yAxis,
    series: series || []
  };
}

/**
 * Context documentation for the show-chart extension
 */
const context = () =>
  '' +
  '### Show Chart Extension' +
  '' +
  'Display interactive charts in the chat interface.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### showChart(options)' +
  'Display an interactive chart.' +
  '`' + '`' + '`' + 'typescript' +
  'await showChart({' +
  '  title: "Monthly Sales",' +
  '  chartType: "bar",              // "bar", "line", "pie", "scatter"' +
  '  xAxis: ["Jan", "Feb", "Mar"],    // X-axis labels' +
  '  yAxis: "Sales",                 // Y-axis label' +
  '  series: [{                      // Data series' +
  '    name: "Revenue",' +
  '    data: [150, 230, 224]' +
  '  }]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`title\\` (required): Chart title' +
  '- \\`chartType\\` (required): Chart type - "bar", "line", "pie", or "scatter"' +
  '- \\`xAxis\\` (optional): X-axis labels (array of strings)' +
  '- \\`yAxis\\` (optional): Y-axis label' +
  '- \\`series\\` (required): Array of data series with \\`name\\` and \\`data\\`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Bar chart:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showChart({' +
  '  title: "Quarterly Revenue",' +
  '  chartType: "bar",' +
  '  xAxis: ["Q1", "Q2", "Q3", "Q4"],' +
  '  yAxis: "Revenue ($)",' +
  '  series: [{' +
  '    name: "Revenue",' +
  '    data: [12500, 15000, 18200, 21000]' +
  '  }]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '2. **Line chart:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showChart({' +
  '  title: "Stock Price Trend",' +
  '  chartType: "line",' +
  '  xAxis: ["Mon", "Tue", "Wed", "Thu", "Fri"],' +
  '  yAxis: "Price ($)",' +
  '  series: [{' +
  '    name: "AAPL",' +
  '    data: [175.5, 178.2, 176.8, 180.1, 182.3]' +
  '  }]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '3. **Pie chart:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showChart({' +
  '  title: "Market Share",' +
  '  chartType: "pie",' +
  '  series: [{' +
  '    name: "Company A",' +
  '    data: 35' +
  '  }, {' +
  '    name: "Company B",' +
  '    data: 25' +
  '  }, {' +
  '    name: "Company C",' +
  '    data: 40' +
  '  }]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Charts render interactively in the chat interface' +
  '- Use after querying data with duckdb, postgresql, etc.' +
  '- Return the result directly to display the chart';

/**
 * Show chart extension
 */
const showChartExtension = {
  /**
   * Display interactive chart
   *
   * Usage:
   * await showChart({
   *   title: 'Monthly Sales',
   *   chartType: 'bar',
   *   data: {
   *     xAxis: ['Jan', 'Feb', 'Mar'],
   *     series: [{ name: 'Sales', data: [150, 230, 224] }]
   *   }
   * });
   */
  showChart: async (args: ShowChartOptions | ChartJsOptions): Promise<ChartVisualizationResult> => {
    // Debug logging to file
    debugLog('=== showChart called ===');
    debugLog('Received args:', args);
    debugLog('args.series:', args?.series);
    debugLog('args.datasets:', args?.datasets);
    debugLog('args keys:', Object.keys(args || {}));

    // Convert Chart.js format to internal format if needed
    const normalizedArgs = convertChartJsFormat(args);

    debugLog('normalizedArgs:', normalizedArgs);
    debugLog('normalizedArgs.series:', normalizedArgs?.series);
    debugLog('=========================');

    // Register visualization with the script runtime
    // This ensures charts are included in __visualizations array
    if (globalThis.__registerVisualization) {
      return globalThis.__registerVisualization("show-chart", normalizedArgs);
    }

    // Fallback for direct usage (not recommended)
    const toolCallId = `call_${Date.now()}_chart`;
    return {
      __visualization: {
        type: "show-chart",
        toolCallId,
        args: normalizedArgs
      }
    };
  },
};

return showChartExtension;
