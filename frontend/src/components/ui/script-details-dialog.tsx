import { useEffect, useState, useMemo } from "react";
import { codeToHtml } from "shiki";
import { format } from "prettier/standalone";
import prettierPluginTypeScript from "prettier/plugins/typescript";
import prettierPluginEstree from "prettier/plugins/estree";
import { useShallow } from "zustand/react/shallow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./dialog";
import { Loader2, Copy, Check, X } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { useUIStore } from "@/stores/ui-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { getInspector } from "./chat/tools/extension-inspector-registry";
import "./script-details-dialog-tabs.css";

interface ScriptDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: string;
  code: string;
  state: "call" | "executing" | "progress" | "result" | "error";
  progressMessages?: string[];
  result?: any;
  error?: string;
  // NEW: Inspection data for extension-specific tabs
  inspectionData?: Record<string, any>;
}

export function ScriptDetailsDialog({
  open,
  onOpenChange,
  purpose,
  code,
  state,
  progressMessages = [],
  result,
  error,
  inspectionData,
}: ScriptDetailsDialogProps) {
  const {
    highlightedCode,
    highlightedResult,
    setHighlightedCode,
    setHighlightedResult,
  } = useUIStore(
    useShallow((state) => ({
      highlightedCode: state.highlightedCode,
      highlightedResult: state.highlightedResult,
      setHighlightedCode: state.setHighlightedCode,
      setHighlightedResult: state.setHighlightedResult,
    }))
  );

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [copiedError, setCopiedError] = useState(false);

  // Max size for display (100KB) - larger results will be truncated
  const MAX_DISPLAY_SIZE = 100 * 1024;

  const copyToClipboard = async (text: string, type: "code" | "result" | "error") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else if (type === "result") {
        setCopiedResult(true);
        setTimeout(() => setCopiedResult(false), 2000);
      } else {
        setCopiedError(true);
        setTimeout(() => setCopiedError(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  /**
   * Truncate large data for display to prevent browser freeze
   * Returns { data: truncatedData, isTruncated: boolean }
   */
  const truncateForDisplay = (data: any): { data: any; isTruncated: boolean } => {
    const serialized = typeof data === "string" ? data : JSON.stringify(data, null, 2);

    if (serialized.length <= MAX_DISPLAY_SIZE) {
      return { data, isTruncated: false };
    }

    // Result is too large - truncate it
    console.warn(`[ScriptDetailsDialog] Result too large (${serialized.length} chars), truncating for display`);

    if (typeof data === "string") {
      return {
        data: serialized.substring(0, MAX_DISPLAY_SIZE) + "\n\n... [truncated for display]",
        isTruncated: true
      };
    } else if (Array.isArray(data)) {
      // For arrays, show first N items
      const itemSize = Math.ceil(serialized.length / data.length);
      const itemsToShow = Math.floor(MAX_DISPLAY_SIZE / itemSize);
      return {
        data: [...data.slice(0, itemsToShow), `... [${data.length - itemsToShow} more items truncated for display]`],
        isTruncated: true
      };
    } else if (typeof data === "object" && data !== null) {
      // For objects, show partial
      const keys = Object.keys(data);
      const truncatedObj: any = {};
      let currentSize = 0;

      for (const key of keys) {
        const valueStr = JSON.stringify(data[key]);
        if (currentSize + valueStr.length > MAX_DISPLAY_SIZE) {
          truncatedObj["..."] = `[${keys.length - Object.keys(truncatedObj).length} more keys truncated for display]`;
          break;
        }
        truncatedObj[key] = data[key];
        currentSize += valueStr.length;
      }

      return { data: truncatedObj, isTruncated: true };
    }

    return {
      data: serialized.substring(0, MAX_DISPLAY_SIZE) + "\n\n... [truncated for display]",
      isTruncated: true
    };
  };

  // Compute truncated result display data (memoized to avoid infinite re-renders)
  const { data: displayResult, isTruncated: resultTruncated } = useMemo(() => {
    if (!result) return { data: null, isTruncated: false };
    return truncateForDisplay(result);
  }, [result]);

  useEffect(() => {
    if (open && code) {
      // Format and highlight the script code
      (async () => {
        let formattedCode = code;
        try {
          formattedCode = await format(code, {
            parser: "typescript",
            plugins: [prettierPluginTypeScript, prettierPluginEstree],
            semi: true,
            singleQuote: false,
            tabWidth: 2,
            printWidth: 80,
          });
        } catch (error) {
          console.warn("Failed to format code:", error);
          // Use original code if formatting fails
        }

        const highlighted = await codeToHtml(formattedCode, {
          lang: "typescript",
          theme: "github-light",
          mergeWhitespaces: false,
        });
        setHighlightedCode(highlighted);
      })();
    }
  }, [open, code]);

  useEffect(() => {
    if (open && result) {
      // Truncate large results before highlighting to prevent browser freeze
      const { data: displayData } = truncateForDisplay(result);
      const resultStr =
        typeof displayData === "string" ? displayData : JSON.stringify(displayData, null, 2);

      codeToHtml(resultStr, {
        lang: "json",
        theme: "github-light",
      }).then(setHighlightedResult);
    }
  }, [open, result]);

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
      <DialogContent className="max-w-[95vw] sm:max-w-7xl max-h-[90dvh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg pr-8">
            <span className="truncate">{purpose}</span>
            <Badge className="shrink-0">{getStateLabel()}</Badge>
          </DialogTitle>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="space-y-4 h-full flex flex-col">
            {/* Executing Status */}
            {state === "executing" && (
              <div className="rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 p-3">
                <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Executing script...</span>
                </div>
              </div>
            )}

            {/* Progress Messages */}
            {progressMessages.length > 0 && (
              <div className="rounded-md border bg-amber-50/50 dark:bg-amber-950/30 p-3 space-y-1">
                {progressMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
                  >
                    {idx === progressMessages.length - 1 &&
                      state === "progress" ? (
                      <Loader2 className="h-4 w-4 animate-spin mt-0.5 shrink-0" />
                    ) : (
                      <span className="text-amber-500">•</span>
                    )}
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabbed Interface */}
            <div className="flex-1 min-h-0">
              <Tabs defaultValue="code" className="h-full flex flex-col">
                <TabsList className="grid w-full auto-cols-fr">
                  <TabsTrigger value="code">Code</TabsTrigger>
                  {(result && state === "result") || error ? (
                    <TabsTrigger value="result">Result</TabsTrigger>
                  ) : null}
                  {inspectionData && Object.keys(inspectionData).length > 0 && Object.keys(inspectionData).map((extensionId) => (
                    <TabsTrigger key={extensionId} value={`inspection-${extensionId}`}>
                      {extensionId.charAt(0).toUpperCase() + extensionId.slice(1)} Details
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Code Tab */}
                <TabsContent value="code" className="flex-1 min-h-0 mt-2">
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Code</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => copyToClipboard(code, "code")}
                      >
                        {copiedCode ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    <div className="flex-1 flex text-[11px] min-h-0">
                      {highlightedCode ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: highlightedCode }}
                          className="overflow-auto relative flex-1 [&>pre]:absolute [&>pre]:p-4 [&>pre>code]:whitespace-pre-wrap  [&>pre]:bg-[#0d1117]"
                        />
                      ) : (
                        <pre className="p-4 bg-[#fff] overflow-auto flex-1">
                          <code>{code}</code>
                        </pre>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Result Tab */}
                {(result && state === "result") || error ? (
                  <TabsContent value="result" className="flex-1 min-h-0 mt-2">
                    <div className="flex flex-col h-full">
                      {result && state === "result" && (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold">Result</h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() =>
                                copyToClipboard(
                                  typeof result === "string"
                                    ? result
                                    : JSON.stringify(result, null, 2),
                                  "result"
                                )
                              }
                            >
                              {copiedResult ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>

                          {/* Truncation Warning */}
                          {resultTruncated && (
                            <div className="mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-400">
                              ⚠️ Result truncated for display (too large). Use Copy button for full data.
                            </div>
                          )}

                          <div className="flex-1 flex text-[11px] min-h-0">
                            {highlightedResult ? (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: highlightedResult,
                                }}
                                className="overflow-auto relative flex-1 [&>pre]:absolute [&>pre]:p-4 [&>pre>code]:whitespace-pre-wrap  [&>pre]:bg-[#0d1117]"
                              />
                            ) : (
                              <pre className="p-4 bg-[#0d1117]  overflow-x-auto flex-1">
                                <code>
                                  {typeof displayResult === "string"
                                    ? displayResult
                                    : JSON.stringify(displayResult, null, 2)}
                                </code>
                              </pre>
                            )}
                          </div>
                        </>
                      )}

                      {error && (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
                              Error
                            </h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => copyToClipboard(error, "error")}
                            >
                              {copiedError ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                          <div className="text-[11px] border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 p-3 overflow-auto flex-1">
                            <pre className="text-red-700 dark:text-red-400 whitespace-pre-wrap">
                              {error}
                            </pre>
                          </div>
                        </>
                      )}

                      {!result && !error && state !== "executing" && (
                        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                          No result yet
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ) : null}

                {/* Extension-Specific Inspection Tabs */}
                {inspectionData && Object.keys(inspectionData).length > 0 && Object.entries(inspectionData).map(([extensionId, data]) => (
                  <TabsContent key={`inspection-${extensionId}`} value={`inspection-${extensionId}`} className="flex-1 min-h-0 mt-2">
                    <div className="h-full overflow-auto">
                      {(() => {
                        const InspectorComponent = getInspector(extensionId);
                        if (InspectorComponent) {
                          return <InspectorComponent data={data} error={error} />;
                        }
                        return (
                          <div className="p-4 text-sm text-muted-foreground">
                            No inspector available for extension: <code className="font-mono">{extensionId}</code>
                          </div>
                        );
                      })()}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
