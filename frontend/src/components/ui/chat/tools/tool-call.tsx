import { Ban, Code2, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import React, { Suspense } from "react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { MemoryToolGroup } from "./memory-tool-group";
import type { ToolInvocation } from "./types";
import { getExtensionComponent } from "./extension-component-registry";

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
  const { setSelectedScript, setSelectedGenericTool } =
    useUIStore(
      useShallow((state) => ({
        setSelectedScript: state.setSelectedScript,
        setSelectedGenericTool: state.setSelectedGenericTool,
      }))
    );

  if (!toolInvocations?.length) return null;

  // Group adjacent memory tool calls
  const groupedInvocations: Array<ToolInvocation | ToolInvocation[]> = [];
  let currentMemoryGroup: ToolInvocation[] = [];

  toolInvocations.forEach((invocation) => {
    if (invocation.toolName === "memory") {
      currentMemoryGroup.push(invocation);
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
      // Push the other tool
      groupedInvocations.push(invocation);
    }
  });

  // Don't forget to push any remaining memory groups
  if (currentMemoryGroup.length > 0) {
    groupedInvocations.push(
      currentMemoryGroup.length === 1
        ? currentMemoryGroup[0]
        : currentMemoryGroup
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {groupedInvocations.map((invocationOrGroup, index) => {
        // Handle tool groups (memory)
        if (Array.isArray(invocationOrGroup)) {
          const toolName = invocationOrGroup[0]?.toolName;
          if (toolName === "memory") {
            return (
              <MemoryToolGroup
                key={`memory-group-${index}`}
                invocations={invocationOrGroup}
              />
            );
          }
          // Unknown tool group type, skip
          return null;
        }

        const invocation = invocationOrGroup;

        const isScript = invocation.toolName === "script";
        const isChart = invocation.toolName === "show-chart";
        const isTable = invocation.toolName === "show-table";
        const isMermaid = invocation.toolName === "show-mermaid";

        // Check if this script invocation has visualizations in its result
        const scriptVisualizations = isScript && 'result' in invocation && invocation.result?.__visualizations
          ? invocation.result.__visualizations
          : null;

        // Debug logging to see what's in the result
        if (isScript) {
          console.log('[ToolCall] Script invocation result:', 'result' in invocation ? invocation.result : undefined);
          console.log('[ToolCall] Script visualizations found:', scriptVisualizations);
          console.log('[ToolCall] Has __visualizations key?', 'result' in invocation && '__visualizations' in (invocation.result || {}));
          console.log('[ToolCall] __visualizations count:', scriptVisualizations?.length || 0);
          console.log('[ToolCall] __visualizations types:', scriptVisualizations?.map((v: any) => v.type) || []);
          console.log('[ToolCall] Full invocation:', invocation);
        }

        // Handle visualization tool calls using backend plugin system
        if (isChart || isTable || isMermaid) {
          // Create wrapper component that loads backend UI
          const VizComponentWrapper = () => {
            const [Comp, setComp] = React.useState<ComponentType<any> | null>(null);

            React.useEffect(() => {
              getExtensionComponent(invocation.toolName).then(comp => {
                setComp(() => comp || (() => <div className="p-4 text-sm text-muted-foreground">UI component not found</div>));
              });
            }, [invocation.toolName]);

            if (!Comp) return <div className="h-[300px] w-full animate-pulse bg-muted rounded-xl" />;

            return <Comp toolInvocation={invocation as any} />;
          };

          return (
            <Suspense key={index} fallback={<div className="h-[300px] w-full animate-pulse bg-muted rounded-xl" />}>
              <VizComponentWrapper />
            </Suspense>
          );
        }

        const handleScriptClick = () => {
          if (isScript) {
            console.log('[handleScriptClick] invocation:', invocation);
            console.log('[handleScriptClick] has inspectionData?', !!(invocation as any).inspectionData);
            console.log('[handleScriptClick] inspectionData:', (invocation as any).inspectionData);

            // For executing state, code might be in result field
            const code =
              invocation.args?.code ||
              (invocation.state === "executing" && 'result' in invocation && invocation.result?.code) ||
              "";
            const purpose =
              invocation.args?.purpose ||
              (invocation.state === "executing" &&
                'result' in invocation && invocation.result?.purpose) ||
              "Script execution";

            if (code) {
              // Result is now directly available without nesting
              const actualResult = 'result' in invocation ? invocation.result : undefined;

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
                error: ('result' in invocation && invocation.result?.error) || ('error' in invocation ? invocation.error : undefined),
                // Include inspection data if available
                inspectionData: (invocation as any).inspectionData,
              });
            }
          }
        };

        const handleGenericToolClick = () => {
          // For all other tool types (not script)
          if (!isScript) {
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
          } else {
            handleGenericToolClick();
          }
        };

        if (invocation.toolName === "todo") return null;

        // Check for cancelled state - handle both formats
        const isCancelled =
          invocation.state === "result" &&
          'result' in invocation &&
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
                {'result' in invocation && invocation.result?.code && (
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
                {'result' in invocation && invocation.result?.message && (
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
                {/* Render visualizations from script result using backend plugin system */}
                {scriptVisualizations && scriptVisualizations.length > 0 && (
                  <div className="mt-2 mb-4">
                    {scriptVisualizations.map((viz: any, vizIndex: number) => {
                      // Create wrapper component for each visualization
                      const VizComponentWrapper = () => {
                        const [Comp, setComp] = React.useState<ComponentType<any> | null>(null);
                        const [error, setError] = React.useState<string | null>(null);

                        React.useEffect(() => {
                          getExtensionComponent(viz.type).then(comp => {
                            if (comp) {
                              setComp(() => comp);
                            } else {
                              setError(`UI component not found for: ${viz.type}`);
                            }
                          }).catch(err => {
                            console.error(`[VizComponentWrapper] Error loading component for ${viz.type}:`, err);
                            setError(`Failed to load component: ${err.message}`);
                          });
                        }, [viz.type, vizIndex]);

                        if (error) {
                          return <div className="p-4 text-sm text-red-600 dark:text-red-400">Error: {error}</div>;
                        }

                        if (!Comp) return <div className="h-[200px] w-full animate-pulse bg-muted rounded-xl" />;

                        // Create toolInvocation in the format expected by the UI component
                        // The component expects: toolInvocation.result.args = chart data
                        // For extensions like show-mermaid, args may be a string - wrap in { code: args }
                        const normalizedArgs = typeof viz.args === 'string'
                          ? { code: viz.args }
                          : viz.args;

                        const vizInvocation = {
                          toolName: viz.type,
                          toolCallId: viz.toolCallId,
                          args: {},  // Empty args at root level
                          state: "result" as const,
                          result: {
                            args: normalizedArgs  // ← Chart data goes here, where component expects it
                          }
                        };

                        console.log(`[VizComponentWrapper] Rendering ${viz.type} with args:`, vizInvocation.result.args);
                        console.log(`[VizComponentWrapper] Full viz object:`, viz);
                        console.log(`[VizComponentWrapper] Has series?`, !!vizInvocation.result.args?.series, 'series:', vizInvocation.result.args?.series);
                        console.log(`[VizComponentWrapper] Has datasets?`, !!vizInvocation.result.args?.datasets, 'datasets:', vizInvocation.result.args?.datasets);

                        try {
                          return <Comp toolInvocation={vizInvocation} />;
                        } catch (err) {
                          console.error(`[VizComponentWrapper] Error rendering ${viz.type}:`, err);
                          return <div className="p-4 text-sm text-red-600 dark:text-red-400">Render error: {err instanceof Error ? err.message : 'Unknown error'}</div>;
                        }
                      };

                      return (
                        <Suspense key={`${index}-viz-${vizIndex}`} fallback={<div className="h-[200px] w-full animate-pulse bg-muted rounded-xl" />}>
                          <VizComponentWrapper />
                        </Suspense>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          case "error":
            // Extract error message from result or error field
            const errorMessage = ('result' in invocation && invocation.result?.error) || ('error' in invocation ? invocation.error : undefined);

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
