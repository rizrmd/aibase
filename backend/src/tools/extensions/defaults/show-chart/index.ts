/**
 * Show Chart Extension
 * Display interactive charts in the frontend
 */

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
  '  xAxis: ["Jan", "Feb", "Mar"],    // X-axis labels (optional for pie)' +
  '  yAxis: "Sales",                 // Y-axis label (optional for pie)' +
  '  series: [{' +
  '    name: "Revenue",' +           // Series name (REQUIRED)' +
  '    data: [150, 230, 224]' +      // Series data (REQUIRED) - array of numbers' +
  '  }]' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**CRITICAL: Each series MUST have both `name` AND `data` fields:**' +
  '' +
  '✅ CORRECT:' +
  '`' + '`' + '`' + 'typescript' +
  'series: [{' +
  '  name: "Sales",' +
  '  data: [100, 200, 300]' +       // ← data MUST be included!' +
  '}]' +
  '`' + '`' + '`' +
  '' +
  '❌ WRONG (will show "No chart data available"):' +
  '`' + '`' + '`' + 'typescript' +
  'series: [{' +
  '  name: "Sales"' +                // ← Missing data field!' +
  '}]' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`title\\` (required): Chart title' +
  '- \\`chartType\\` (required): Chart type - "bar", "line", "pie", or "scatter"' +
  '- \\`xAxis\\` (optional): X-axis labels (array of strings)' +
  '- \\`yAxis\\` (optional): Y-axis label' +
  '- \\`series\\` (required): Array of data series. Each series MUST have \\`name\\` (string) AND \\`data\\` (array of numbers or single number for pie)' +
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
  '2. **Line chart with multiple series:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showChart({' +
  '  title: "Sales vs Profit",' +
  '  chartType: "line",' +
  '  xAxis: ["Jan", "Feb", "Mar", "Apr"],' +
  '  yAxis: "Amount ($)",' +
  '  series: [{' +
  '    name: "Sales",' +
  '    data: [5000, 7000, 6000, 8000]' +
  '  }, {' +
  '    name: "Profit",' +
  '    data: [1000, 2000, 1500, 2500]' +
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
  '- Return the result directly to display the chart' +
  '- Each series item MUST include both `name` AND `data` fields';

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
   *   xAxis: ['Jan', 'Feb', 'Mar'],
   *   series: [{ name: 'Sales', data: [150, 230, 224] }]
   * });
   */
  showChart: async (args: ShowChartOptions | ChartJsOptions): Promise<ChartVisualizationResult> => {
    // Convert Chart.js format to internal format if needed
    const normalizedArgs = convertChartJsFormat(args);

    // Return visualization metadata directly
    // ScriptRuntime will collect this into __visualizations array
    const toolCallId = `viz_chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
      __visualization: {
        type: "show-chart",
        toolCallId,
        args: normalizedArgs
      }
    };
  },
};

// @ts-expect-error - Extension loader wraps this code in an async function
return showChartExtension;
