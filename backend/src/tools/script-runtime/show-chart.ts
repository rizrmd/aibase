/**
 * Context documentation for showChart functionality
 */
export const context = async () => {
  return `### SHOW CHART

**IMPORTANT: \`showChart\` is a script tool function available in your script execution environment, NOT a direct tool.**

You call \`showChart()\` directly within your TypeScript/JavaScript code - it is NOT invoked via tool use. Just use it like a regular async function.

Use showChart() to display interactive charts in the frontend.

**Available:** showChart({ title, description?, chartType, data, saveTo? })

#### PARAMETERS

- title: Chart title (required)
- description: Optional chart description
- chartType: 'bar', 'line', 'pie', 'area', etc. (required)
- data: Chart data with xAxis and series (required)
- saveTo: Optional filename to save chart as PNG (e.g., 'sales-chart.png')
  - xAxis: Array of x-axis labels
  - series: Array of data series, each with name and data array

#### EXAMPLE

\`\`\`typescript
// Simple bar chart
const data = { xAxis: ['Jan', 'Feb', 'Mar'], series: [{ name: 'Sales', data: [150, 230, 224] }] };
await showChart({ title: 'Monthly Sales', chartType: 'bar', data });

// Line chart with description
const sales = { xAxis: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', data: [1000, 1500, 1200, 1800] }] };
await showChart({ title: 'Quarterly Revenue', description: 'Revenue in thousands', chartType: 'line', data: sales });

// Chart with auto-save
await showChart({ title: 'Sales Report', chartType: 'bar', data, saveTo: 'sales-report.png' });
return { chart: 'displayed' };
\`\`\``
};

/**
 * Create a showChart function that broadcasts a tool call to the frontend
 */
export function createShowChartFunction(broadcast: (type: "tool_call" | "tool_result", data: any) => void) {
    return async (args: { title: string; description?: string; chartType: string; data: any; saveTo?: string }) => {
        const toolCallId = `call_${Date.now()}_chart`;

        // Return data for history persistence (no broadcast - will be included in script result)
        return {
            __visualization: {
                type: "show-chart",
                toolCallId,
                args
            }
        };
    };
}
