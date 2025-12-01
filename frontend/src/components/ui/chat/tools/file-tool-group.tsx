import { useState } from "react";
import { Ban, ChevronRight, Code2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useUIStore } from "@/stores/ui-store";
import type { ToolInvocation } from "./types";

export function FileToolGroup({
  invocations,
}: {
  invocations: ToolInvocation[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const setSelectedFileTool = useUIStore((state) => state.setSelectedFileTool);

  // Determine the overall state of the group based on the latest state
  const latestState = invocations[invocations.length - 1]?.state || "call";
  const hasError = invocations.some((inv) => inv.state === "error");

  // Get color classes based on state
  const getGroupColorClasses = () => {
    if (hasError) {
      return "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30";
    }
    switch (latestState) {
      case "partial-call":
      case "call":
        return "border-blue-200 bg-blue-50/50 dark:border-slate-800 dark:bg-blue-950/30";
      case "executing":
        return "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/30";
      case "progress":
        return "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30";
      case "result":
        return "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30";
      default:
        return "border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30";
    }
  };

  const getIconColorClasses = () => {
    if (hasError) {
      return "text-red-700 dark:text-red-400";
    }
    switch (latestState) {
      case "partial-call":
      case "call":
        return "text-slate-700 dark:text-blue-400";
      case "executing":
        return "text-purple-700 dark:text-purple-400";
      case "progress":
        return "text-amber-700 dark:text-amber-400";
      case "result":
        return "text-green-700 dark:text-green-400";
      default:
        return "text-slate-700 dark:text-slate-400";
    }
  };

  const getFileActionLabel = (inv: ToolInvocation) => {
    const action = inv.args?.action || "operation";
    const path = inv.args?.path;

    if (path) {
      return `${action} ${path}`;
    }
    return action;
  };

  const handleFileClick = (inv: ToolInvocation) => {
    if (inv.args?.action) {
      setSelectedFileTool({
        action: inv.args.action,
        path: inv.args.path,
        newPath: inv.args.newPath,
        state: inv.state === "partial-call" ? "call" : inv.state,
        result: "result" in inv ? inv.result : undefined,
        error: "error" in inv ? inv.error : undefined,
      });
    }
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "group w-full rounded-xl border px-2.5 py-1.5 cursor-pointer hover:opacity-80 transition-opacity",
        getGroupColorClasses()
      )}
    >
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 text-xs w-full">
          {latestState === "call" ||
          latestState === "partial-call" ||
          latestState === "executing" ||
          latestState === "progress" ? (
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          ) : hasError ? (
            <Ban className="h-3 w-3 shrink-0" />
          ) : (
            <Code2 className="h-3 w-3 shrink-0" />
          )}
          <span className={cn("font-mono flex-1", getIconColorClasses())}>
            File ({invocations.length}{" "}
            {invocations.length === 1 ? "operation" : "operations"})
          </span>
          <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90 shrink-0" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-5 space-y-1">
          {invocations.map((inv, idx) => (
            <div
              key={idx}
              className={cn(
                "text-xs py-0.5 cursor-pointer hover:underline",
                inv.state === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-600 dark:text-slate-400"
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleFileClick(inv);
              }}
            >
              <span className="font-mono">{getFileActionLabel(inv)}</span>
              {inv.state === "error" && inv.error && (
                <div className="text-[10px] ml-2 text-red-500 dark:text-red-400">
                  {inv.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
