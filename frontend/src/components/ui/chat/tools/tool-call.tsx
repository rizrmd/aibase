import { Ban, Code2, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { MemoryToolGroup } from "./memory-tool-group";
import { FileToolGroup } from "./file-tool-group";
import { ChartTool } from "./chart-tool";
import { TableTool } from "./table-tool";
import { MermaidTool } from "./mermaid-tool";
import type { ToolInvocation } from "./types";

// Helper function to format duration display
function formatDuration(duration?: number): string | null {
  if (!duration) return null;
  if (duration < 1) return `${Math.round(duration * 1000)}ms`;
  return `${duration}s`;
}

interface ToolCallProps {
  toolInvocations?: ToolInvocation[];
}

export function ToolCall({ toolInvocations }: ToolCallProps) {
  const { setSelectedScript, setSelectedFileTool, setSelectedGenericTool } =
    useUIStore(
      useShallow((state) => ({
        setSelectedScript: state.setSelectedScript,
        setSelectedFileTool: state.setSelectedFileTool,
        setSelectedGenericTool: state.setSelectedGenericTool,
      }))
    );

  if (!toolInvocations?.length) return null;

  // Group adjacent memory and file tool calls
  const groupedInvocations: Array<ToolInvocation | ToolInvocation[]> = [];
  let currentMemoryGroup: ToolInvocation[] = [];
  let currentFileGroup: ToolInvocation[] = [];

  toolInvocations.forEach((invocation) => {
    if (invocation.toolName === "memory") {
      // Flush file group if any
      if (currentFileGroup.length > 0) {
        groupedInvocations.push(
          currentFileGroup.length === 1 ? currentFileGroup[0] : currentFileGroup
        );
        currentFileGroup = [];
      }
      currentMemoryGroup.push(invocation);
    } else if (invocation.toolName === "file") {
      // Flush memory group if any
      if (currentMemoryGroup.length > 0) {
        groupedInvocations.push(
          currentMemoryGroup.length === 1
            ? currentMemoryGroup[0]
            : currentMemoryGroup
        );
        currentMemoryGroup = [];
      }
      currentFileGroup.push(invocation);
    } else {
      // If we have accumulated memory tools, push them as a group
      if (currentMemoryGroup.length > 0) {
        groupedInvocations.push(
          currentMemoryGroup.length === 1
            ? currentMemoryGroup[0]
            : currentMemoryGroup
        );
        currentMemoryGroup = [];
      }
      // If we have accumulated file tools, push them as a group
      if (currentFileGroup.length > 0) {
        groupedInvocations.push(
          currentFileGroup.length === 1 ? currentFileGroup[0] : currentFileGroup
        );
        currentFileGroup = [];
      }
      // Push the other tool
      groupedInvocations.push(invocation);
    }
  });

  // Don't forget to push any remaining groups
  if (currentMemoryGroup.length > 0) {
    groupedInvocations.push(
      currentMemoryGroup.length === 1
        ? currentMemoryGroup[0]
        : currentMemoryGroup
    );
  }
  if (currentFileGroup.length > 0) {
    groupedInvocations.push(
      currentFileGroup.length === 1 ? currentFileGroup[0] : currentFileGroup
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
        {groupedInvocations.map((invocationOrGroup, index) => {
          // Handle tool groups (memory or file)
          if (Array.isArray(invocationOrGroup)) {
            const toolName = invocationOrGroup[0]?.toolName;
            if (toolName === "memory") {
              return (
                <MemoryToolGroup
                  key={`memory-group-${index}`}
                  invocations={invocationOrGroup}
                />
              );
            } else if (toolName === "file") {
              return (
                <FileToolGroup
                  key={`file-group-${index}`}
                  invocations={invocationOrGroup}
                />
              );
            }
            // Unknown tool group type, skip
            return null;
          }

          const invocation = invocationOrGroup;

          const isScript = invocation.toolName === "script";
          const isFileTool = invocation.toolName === "file";
          const isChart = invocation.toolName === "show-chart";
          const isTable = invocation.toolName === "show-table";
          const isMermaid = invocation.toolName === "show-mermaid";

          // Check if this script invocation has visualizations in its result
          const scriptVisualizations = isScript && invocation.result?.__visualizations
            ? invocation.result.__visualizations
            : null;

          // Debug logging to see what's in the result
          if (isScript) {
            console.log('[ToolCall] Script invocation result:', invocation.result);
            console.log('[ToolCall] Script visualizations found:', scriptVisualizations);
          }

          if (isChart) {
            return <ChartTool key={index} toolInvocation={invocation as any} />;
          }

          if (isTable) {
            return <TableTool key={index} toolInvocation={invocation as any} />;
          }

          if (isMermaid) {
            return <MermaidTool key={index} toolInvocation={invocation as any} />;
          }

          const handleScriptClick = () => {
            if (isScript) {
              // For executing state, code might be in result field
              const code =
                invocation.args?.code ||
                (invocation.state === "executing" && invocation.result?.code) ||
                "";
              const purpose =
                invocation.args?.purpose ||
                (invocation.state === "executing" &&
                  invocation.result?.purpose) ||
                "Script execution";

              if (code) {
                // Result is now directly available without nesting
                const actualResult = invocation.result;

                // Debug logging
                console.log("[Dialog Open] Script invocation data:", {
                  toolCallId: invocation.toolCallId,
                  state: invocation.state,
                  hasResultKey: "result" in invocation,
                  invocationResult:
                    "result" in invocation ? invocation.result : undefined,
                  invocationResultType:
                    "result" in invocation
                      ? typeof invocation.result
                      : "undefined",
                  extractedResult: actualResult,
                  extractedResultType: typeof actualResult,
                  fullInvocation: invocation,
                });

                setSelectedScript({
                  purpose,
                  code,
                  state:
                    invocation.state === "partial-call"
                      ? "call"
                      : invocation.state,
                  result: actualResult,
                  error: "error" in invocation ? invocation.error : undefined,
                });
              }
            }
          };

          const handleFileToolClick = () => {
            if (isFileTool && invocation.args?.action) {
              setSelectedFileTool({
                action: invocation.args.action,
                path: invocation.args.path,
                newPath: invocation.args.newPath,
                state:
                  invocation.state === "partial-call"
                    ? "call"
                    : invocation.state,
                result: "result" in invocation ? invocation.result : undefined,
                error: "error" in invocation ? invocation.error : undefined,
              });
            }
          };

          const handleGenericToolClick = () => {
            // For all other tool types (not script or file)
            if (!isScript && !isFileTool) {
              setSelectedGenericTool({
                toolName: invocation.toolName,
                args: invocation.args,
                state:
                  invocation.state === "partial-call"
                    ? "call"
                    : invocation.state,
                result: "result" in invocation ? invocation.result : undefined,
                error: "error" in invocation ? invocation.error : undefined,
              });
            }
          };

          // Universal click handler that routes to the appropriate handler
          const handleClick = () => {
            if (isScript) {
              handleScriptClick();
            } else if (isFileTool) {
              handleFileToolClick();
            } else {
              handleGenericToolClick();
            }
          };

          if (invocation.toolName === "todo") return null;

          // Check for cancelled state - handle both formats
          const isCancelled =
            invocation.state === "result" &&
            invocation.result?.__cancelled === true;

          if (isCancelled) {
            return (
              <div
                key={index}
                onClick={handleClick}
                className="flex items-center gap-2 rounded border border-muted-foreground/20 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-muted/50"
              >
                <Ban className="h-3 w-3" />
                <span>
                  Cancelled{" "}
                  <code className="font-mono">{invocation.toolName}</code>
                </span>
                {formatDuration(invocation.duration) && (
                  <span className="ml-auto text-muted-foreground/70">
                    [{formatDuration(invocation.duration)}]
                  </span>
                )}
              </div>
            );
          }

          let toolName = (
            <span className="font-mono text-xs">
              {invocation.toolName !== "script" && (
                <span className="capitalize">{invocation.toolName}:</span>
              )}
              {invocation.toolName === "script" && invocation.args?.purpose ? (
                <span className="">{invocation.args.purpose}</span>
              ) : (
                <>
                  {invocation.args?.action
                    ?.split("_")
                    .map((e: string, i: number) => {
                      return (
                        <span className="capitalize ml-1" key={i}>
                          {e}
                        </span>
                      );
                    }) || <span className="ml-1">executing</span>}
                </>
              )}
            </span>
          );

          switch (invocation.state) {
            case "partial-call":
            case "call":
              return (
                <div
                  key={index}
                  onClick={handleClick}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-blue-950/30 dark:text-blue-400",
                    "cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/40"
                  )}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {toolName}
                </div>
              );
            case "executing":
              return (
                <div
                  key={index}
                  onClick={handleClick}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border border-purple-200 bg-purple-50/50 px-3 py-2 text-xs dark:border-purple-800 dark:bg-purple-950/30",
                    "cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {toolName}
                  </div>
                  {invocation.result?.code && (
                    <pre className="ml-6 text-purple-600/70 dark:text-purple-400/70 font-mono text-xs line-clamp-2 whitespace-pre-wrap">
                      {invocation.result.code.substring(0, 100)}
                      {invocation.result.code.length > 100 && "..."}
                    </pre>
                  )}
                </div>
              );
            case "progress":
              return (
                <div
                  key={index}
                  onClick={handleClick}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/50 px-2.5 py-1.5 text-xs dark:border-amber-800 dark:bg-amber-950/30",
                    "cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {toolName}
                  </div>
                  {invocation.result?.message && (
                    <div className="text-amber-600 dark:text-amber-500 ml-5">
                      {invocation.result.message}
                    </div>
                  )}
                </div>
              );
            case "result":
              return (
                <div key={index}>
                  <div
                    onClick={handleClick}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border border-green-200 bg-green-50/50 px-2.5 py-1.5 text-xs dark:border-green-800 dark:bg-green-950/30",
                      "cursor-pointer hover:bg-green-100/50 dark:hover:bg-green-900/40"
                    )}
                  >
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <Code2 className="h-3 w-3" />
                      {toolName}
                      {formatDuration(invocation.duration) && (
                        <span className="ml-auto text-green-600 dark:text-green-500">
                          [{formatDuration(invocation.duration)}]
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Render visualizations from script result */}
                  {scriptVisualizations && scriptVisualizations.length > 0 && (
                    <div className="mt-2 mb-4">
                      {scriptVisualizations
                        .filter((viz: any) => ["show-chart", "show-table", "show-mermaid"].includes(viz.type))
                        .map((viz: any, vizIndex: number) => {
                          const vizInvocation = {
                            toolName: viz.type,
                            toolCallId: viz.toolCallId,
                            args: viz.args,
                            state: "result" as const,
                            result: { __visualization: viz }
                          };

                          if (viz.type === "show-chart") {
                            return <ChartTool key={`${index}-viz-${vizIndex}`} toolInvocation={vizInvocation} />;
                          }
                          if (viz.type === "show-table") {
                            return <TableTool key={`${index}-viz-${vizIndex}`} toolInvocation={vizInvocation} />;
                          }
                          return <MermaidTool key={`${index}-viz-${vizIndex}`} toolInvocation={vizInvocation} />;
                        })}
                    </div>
                  )}
                </div>
              );
            case "error":
              // Extract error message from result or error field
              const errorMessage = invocation.result?.error || invocation.error;

              return (
                <div
                  key={index}
                  onClick={handleClick}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-red-200 bg-red-50/50 px-2.5 py-1.5 text-xs dark:border-red-800 dark:bg-red-950/30",
                    "cursor-pointer hover:bg-red-100/50 dark:hover:bg-red-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <Ban className="h-3 w-3" />
                    {toolName}
                    {formatDuration(invocation.duration) && (
                      <span className="ml-auto text-red-600 dark:text-red-500">
                        [{formatDuration(invocation.duration)}]
                      </span>
                    )}
                  </div>
                  {errorMessage && (
                    <div className="text-red-600 dark:text-red-500 ml-5 font-mono">
                      {errorMessage}
                    </div>
                  )}
                </div>
              );
            default:
              return null;
          }
        })}
    </div>
  );
}
