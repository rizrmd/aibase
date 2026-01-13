import { useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { useTheme } from "next-themes";
import { useVisualizationSave } from "@/hooks/use-visualization-save";

interface ChartToolProps {
    toolInvocation: {
        toolName: string;
        toolCallId: string;
        args: {
            title: string;
            description?: string;
            chartType: string;
            data: any;
            saveTo?: string;
        };
        result?: any;
    };
}

export function ChartTool({ toolInvocation }: ChartToolProps) {
    const { theme } = useTheme();
    const { title, description, chartType, data, saveTo } = toolInvocation.args;
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-save if saveTo is provided
    useVisualizationSave({
        toolCallId: toolInvocation.toolCallId,
        saveTo,
        shouldSave: !!saveTo,
    });

    const option = useMemo(() => {
        // If data is already a full ECharts option, use it
        if (data.series && !Array.isArray(data.series) && data.xAxis) {
            // It might be our simplified structure
        } else if (data.tooltip && data.series) {
            // Likely full option
            return {
                ...data,
                backgroundColor: "transparent",
                textStyle: {
                    fontFamily: "Inter, sans-serif",
                },
            };
        }

        // Construct option based on simplified data
        const baseOption: any = {
            backgroundColor: "transparent",
            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "shadow",
                },
            },
            grid: {
                left: "3%",
                right: "4%",
                bottom: "3%",
                containLabel: true,
            },
            textStyle: {
                fontFamily: "Inter, sans-serif",
            },
        };

        if (chartType === "pie") {
            baseOption.tooltip = {
                trigger: "item",
            };
            baseOption.series = data.series.map((s: any) => ({
                ...s,
                type: "pie",
                radius: ["40%", "70%"],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: "#fff",
                    borderWidth: 2,
                },
                label: {
                    show: false,
                    position: "center",
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 20,
                        fontWeight: "bold",
                    },
                },
                labelLine: {
                    show: false,
                },
            }));
        } else {
            // Line, Bar, etc.
            baseOption.xAxis = {
                type: "category",
                data: data.xAxis,
                axisLine: {
                    lineStyle: {
                        color: theme === "dark" ? "#525252" : "#e5e5e5",
                    },
                },
                axisLabel: {
                    color: theme === "dark" ? "#a3a3a3" : "#525252",
                },
            };
            baseOption.yAxis = {
                type: "value",
                splitLine: {
                    lineStyle: {
                        color: theme === "dark" ? "#262626" : "#f5f5f5",
                    },
                },
                axisLabel: {
                    color: theme === "dark" ? "#a3a3a3" : "#525252",
                },
            };
            baseOption.series = data.series.map((s: any) => ({
                ...s,
                type: chartType,
                smooth: chartType === "line",
            }));
        }

        return baseOption;
    }, [chartType, data, theme]);

    return (
        <div
            ref={containerRef}
            data-tool-call-id={toolInvocation.toolCallId}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm"
        >
            <div className="flex flex-col gap-1">
                <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            <div className="h-[300px] w-full">
                <ReactECharts
                    option={option}
                    theme={theme === "dark" ? "dark" : undefined}
                    style={{ height: "100%", width: "100%" }}
                    opts={{ renderer: "svg" }}
                />
            </div>
        </div>
    );
}
