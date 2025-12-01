import { Ban, Code2, Loader2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { cn } from "@/lib/utils";
import { ScriptDetailsDialog } from "@/components/ui/script-details-dialog";
import { FileToolDetailsDialog } from "@/components/ui/file-tool-details-dialog";
import { GenericToolDetailsDialog } from "@/components/ui/generic-tool-details-dialog";
import { useUIStore } from "@/stores/ui-store";
import { MemoryToolGroup } from "./memory-tool-group";
import { FileToolGroup } from "./file-tool-group";
import type { ToolInvocation } from "./types";

interface ToolCallProps {
  toolInvocations?: ToolInvocation[];
}

export function ToolCall({ toolInvocations }: ToolCallProps) {
  const {
    selectedScript,
    selectedFileTool,
    selectedGenericTool,
    setSelectedScript,
    setSelectedFileTool,
    setSelectedGenericTool,
  } = useUIStore(
    useShallow((state) => ({
      selectedScript: state.selectedScript,
      selectedFileTool: state.selectedFileTool,
      selectedGenericTool: state.selectedGenericTool,
      setSelectedScript: state.setSelectedScript,
      setSelectedFileTool: state.setSelectedFileTool,
      setSelectedGenericTool: state.setSelectedGenericTool,
    }))
  );

  if (!toolInvocations?.length) return null;

  // Collect all progress messages for script tools
  const scriptProgressMap = new Map<string, string[]>();
  toolInvocations.forEach((inv) => {
    if (
      inv.toolName === "script" &&
      inv.state === "progress" &&
      "result" in inv &&
      inv.result?.message
    ) {
      const key = inv.toolCallId || inv.args?.purpose || "script";
      if (!scriptProgressMap.has(key)) {
        scriptProgressMap.set(key, []);
      }
      scriptProgressMap.get(key)!.push(inv.result.message);
    }
  });

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
    <>
      <ScriptDetailsDialog
        open={!!selectedScript}
        onOpenChange={(open) => !open && setSelectedScript(null)}
        purpose={selectedScript?.purpose || ""}
        code={selectedScript?.code || ""}
        state={selectedScript?.state || "call"}
        progressMessages={
          selectedScript
            ? scriptProgressMap.get(selectedScript.purpose) || []
            : []
        }
        result={selectedScript?.result}
        error={selectedScript?.error}
      />
      <FileToolDetailsDialog
        open={!!selectedFileTool}
        onOpenChange={(open) => !open && setSelectedFileTool(null)}
        action={selectedFileTool?.action || ""}
        path={selectedFileTool?.path}
        newPath={selectedFileTool?.newPath}
        state={selectedFileTool?.state || "call"}
        result={selectedFileTool?.result}
        error={selectedFileTool?.error}
      />
      <GenericToolDetailsDialog
        open={!!selectedGenericTool}
        onOpenChange={(open) => !open && setSelectedGenericTool(null)}
        toolName={selectedGenericTool?.toolName || ""}
        args={selectedGenericTool?.args}
        state={selectedGenericTool?.state || "call"}
        result={selectedGenericTool?.result}
        error={selectedGenericTool?.error}
      />
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
                // Extract the actual result from the wrapped response
                let actualResult = undefined;
                if ("result" in invocation && invocation.result) {
                  // For completed scripts, result is wrapped as { purpose, result }
                  // Extract the nested result if it exists, otherwise use the whole result
                  actualResult =
                    invocation.result.result !== undefined
                      ? invocation.result.result
                      : invocation.result;
                }

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

          if (invocation.toolName === "todo") return <></>;

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
                    .split("_")
                    .map((e: string, i: number) => {
                      return (
                        <span className="capitalize ml-1" key={i}>
                          {e}
                        </span>
                      );
                    }) || "tool"}
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
                    <div className="ml-6 text-purple-600/70 dark:text-purple-400/70 font-mono text-xs line-clamp-2">
                      {invocation.result.code.substring(0, 100)}
                      {invocation.result.code.length > 100 && "..."}
                    </div>
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
                <div
                  key={index}
                  onClick={handleClick}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border border-green-200 bg-green-50/50 px-2.5 py-1.5 text-xs dark:border-green-800 dark:bg-green-950/30",
                    "cursor-pointer hover:bg-green-100/50 dark:hover:bg-green-900/40"
                  )}
                >
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <Code2 className="h-3 w-3" />
                    {toolName}
                  </div>
                </div>
              );
            case "error":
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
                  </div>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </>
  );
}
