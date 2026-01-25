/**
 * Show Chart Extension
 * Display interactive charts in the frontend
 */

/**
 * Context documentation for the show-chart extension
 */
export const context = () => `
### Show Chart Extension

Display interactive charts in the chat interface.

**Available Functions:**

#### showChart(options)
Display an interactive chart.
\`\`\`typescript
await showChart({
  title: "Monthly Sales",
  chartType: "bar",              // "bar", "line", "pie", "scatter"
  xAxis: ["Jan", "Feb", "Mar"],    // X-axis labels
  yAxis: "Sales",                 // Y-axis label
  series: [{                      // Data series
    name: "Revenue",
    data: [150, 230, 224]
  }]
});
\`\`\`

**Parameters:**
- \`title\` (required): Chart title
- \`chartType\` (required): Chart type - "bar", "line", "pie", or "scatter"
- \`xAxis\` (optional): X-axis labels (array of strings)
- \`yAxis\` (optional): Y-axis label
- \`series\` (required): Array of data series with \`name\` and \`data\`

**Examples:**

1. **Bar chart:**
\`\`\`typescript
await showChart({
  title: "Quarterly Revenue",
  chartType: "bar",
  xAxis: ["Q1", "Q2", "Q3", "Q4"],
  yAxis: "Revenue ($)",
  series: [{
    name: "Revenue",
    data: [12500, 15000, 18200, 21000]
  }]
});
\`\`\`

2. **Line chart:**
\`\`\`typescript
await showChart({
  title: "Stock Price Trend",
  chartType: "line",
  xAxis: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  yAxis: "Price ($)",
  series: [{
    name: "AAPL",
    data: [175.5, 178.2, 176.8, 180.1, 182.3]
  }]
});
\`\`\`

3. **Pie chart:**
\`\`\`typescript
await showChart({
  title: "Market Share",
  chartType: "pie",
  series: [{
    name: "Company A",
    data: 35
  }, {
    name: "Company B",
    data: 25
  }, {
    name: "Company C",
    data: 40
  }]
});
\`\`\`

**Important Notes:**
- Charts render interactively in the chat interface
- Use after querying data with duckdb, postgresql, etc.
- Return the result directly to display the chart
`;

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
  showChart: async (args) => {
    const toolCallId = `call_${Date.now()}_chart`;

    return {
      __visualization: {
        type: "show-chart",
        toolCallId,
        args
      }
    };
  },
};

return showChartExtension;
