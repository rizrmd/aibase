import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/stores/ui-store";

export interface GenericToolDetails {
  toolName: string;
  args?: Record<string, any>;
  state: "call" | "executing" | "progress" | "result" | "error";
  result?: any;
  error?: string;
}

interface GenericToolDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string;
  args?: Record<string, any>;
  state: "call" | "executing" | "progress" | "result" | "error";
  result?: any;
  error?: string;
}

export function GenericToolDetailsDialog({
  open,
  onOpenChange,
  toolName,
  args,
  state,
  result,
  error,
}: GenericToolDetailsDialogProps) {
  const { setHighlightedArgs, setHighlightedResult, highlightedArgs, highlightedResult } = useUIStore(
    useShallow((state) => ({
      setHighlightedArgs: state.setHighlightedArgs,
      setHighlightedResult: state.setHighlightedResult,
      highlightedArgs: state.highlightedArgs,
      highlightedResult: state.highlightedResult,
    }))
  );

  useEffect(() => {
    if (open && args) {
      setHighlightedArgs(JSON.stringify(args, null, 2));
    }
  }, [open, args, setHighlightedArgs]);

  useEffect(() => {
    if (open && result !== undefined) {
      const resultString = typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);
      setHighlightedResult(resultString);
    }
  }, [open, result, setHighlightedResult]);

  const getStateBadgeVariant = () => {
    switch (state) {
      case "call":
        return "default";
      case "executing":
        return "secondary";
      case "progress":
        return "secondary";
      case "result":
        return "default";
      case "error":
        return "destructive";
      default:
        return "default";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{toolName}</span>
            <Badge variant={getStateBadgeVariant()}>{state}</Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Arguments */}
            {args && Object.keys(args).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Parameters</h3>
                <div className="rounded-lg border bg-muted/50 p-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {highlightedArgs || JSON.stringify(args, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Result */}
            {result !== undefined && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Output</h3>
                <div className="rounded-lg border bg-muted/50 p-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {highlightedResult || (typeof result === 'string' ? result : JSON.stringify(result, null, 2))}
                  </pre>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-red-600 dark:text-red-400">
                  Error
                </h3>
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/30">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-red-700 dark:text-red-300">
                    {error}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
