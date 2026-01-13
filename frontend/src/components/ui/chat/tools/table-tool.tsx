
import { useRef } from "react";
import { useVisualizationSave } from "@/hooks/use-visualization-save";

interface TableToolProps {
    toolInvocation: {
        toolName: string;
        toolCallId: string;
        args: {
            title: string;
            description?: string;
            columns: { key: string; label: string }[];
            data: any[];
            saveTo?: string;
        };
        result?: any;
    };
}

export function TableTool({ toolInvocation }: TableToolProps) {
    const { title, description, columns, data, saveTo } = toolInvocation.args;
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-save if saveTo is provided
    useVisualizationSave({
        toolCallId: toolInvocation.toolCallId,
        saveTo,
        shouldSave: !!saveTo,
    });

    // Fallback if Shadcn Table is not available (I'll assume it is based on project description, but safe to check)
    // Since I can't check file existence inside write_to_file, I'll use standard HTML table with Tailwind classes
    // that mimic Shadcn UI for safety, or I can try to import and if it fails...
    // Actually, I'll just use standard HTML with Tailwind to be safe and avoid import errors if Shadcn components are missing.
    // Wait, the user said "Shadcn UI for components" in previous conversation summary.
    // I'll try to use the standard HTML structure that matches Shadcn UI.

    return (
        <div
            ref={containerRef}
            data-tool-call-id={toolInvocation.toolCallId}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm overflow-hidden"
        >
            <div className="flex flex-col gap-1 mb-2">
                <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                        <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className="h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {data.map((row, i) => (
                            <tr
                                key={i}
                                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                            >
                                {columns.map((col) => (
                                    <td
                                        key={`${i}-${col.key}`}
                                        className="p-2 align-middle [&:has([role=checkbox])]:pr-0"
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
