import { useEffect } from "react";
import { codeToHtml } from "shiki";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { ScrollArea } from "./scroll-area";
import { File, Folder, Info, Trash2, Edit3, FolderSearch } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";

interface FileToolDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  path?: string;
  newPath?: string;
  state: "call" | "executing" | "progress" | "result" | "error";
  result?: any;
  error?: string;
}

function getActionIcon(action: string) {
  switch (action) {
    case "list":
      return Folder;
    case "info":
      return Info;
    case "delete":
      return Trash2;
    case "rename":
      return Edit3;
    default:
      return File;
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "list":
      return "List Files";
    case "info":
      return "File Info";
    case "delete":
      return "Delete File";
    case "rename":
      return "Rename File";
    default:
      return action;
  }
}

export function FileToolDetailsDialog({
  open,
  onOpenChange,
  action,
  path,
  newPath,
  state,
  result,
  error,
}: FileToolDetailsDialogProps) {
  const { highlightedResult, setHighlightedResult } = useUIStore();
  const ActionIcon = getActionIcon(action);

  useEffect(() => {
    if (open && result) {
      // Highlight the result
      const resultStr =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);
      codeToHtml(resultStr, {
        lang: "json",
        theme: "github-dark",
      }).then(setHighlightedResult);
    }
  }, [open, result]);

  const getStateColor = () => {
    switch (state) {
      case "call":
        return "text-blue-600 dark:text-blue-400";
      case "executing":
        return "text-purple-600 dark:text-purple-400";
      case "progress":
        return "text-amber-600 dark:text-amber-400";
      case "result":
        return "text-green-600 dark:text-green-400";
      case "error":
        return "text-red-600 dark:text-red-400";
      default:
        return "";
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case "call":
        return "Calling";
      case "executing":
        return "Executing";
      case "progress":
        return "In Progress";
      case "result":
        return "Completed";
      case "error":
        return "Failed";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ActionIcon className="h-5 w-5" />
            <span>{getActionLabel(action)}</span>
            <span className={`text-sm font-normal ${getStateColor()}`}>
              {getStateLabel()}
            </span>
          </DialogTitle>
          <DialogDescription>
            {path && <span>Path: {path}</span>}
            {newPath && <span className="ml-4">→ {newPath}</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Operation Details */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Operation</h3>
              <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
                <div>
                  <span className="font-medium">Action:</span> {action}
                </div>
                {path && (
                  <div>
                    <span className="font-medium">Path:</span>{" "}
                    <code className="px-1.5 py-0.5 rounded bg-background">
                      {path}
                    </code>
                  </div>
                )}
                {newPath && (
                  <div>
                    <span className="font-medium">New Path:</span>{" "}
                    <code className="px-1.5 py-0.5 rounded bg-background">
                      {newPath}
                    </code>
                  </div>
                )}
              </div>
            </div>

            {/* Result */}
            {result && state === "result" && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Result</h3>
                <div className="rounded-md overflow-hidden border">
                  {highlightedResult ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: highlightedResult }}
                      className="text-sm [&>pre]:p-4 [&>pre]:overflow-x-auto [&>pre]:bg-[#0d1117]"
                    />
                  ) : (
                    <pre className="p-4 bg-[#0d1117] text-sm overflow-x-auto text-white">
                      <code>
                        {typeof result === "string"
                          ? result
                          : JSON.stringify(result, null, 2)}
                      </code>
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && state === "error" && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-red-600 dark:text-red-400">
                  Error
                </h3>
                <div className="rounded-md border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30 p-3">
                  <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
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
