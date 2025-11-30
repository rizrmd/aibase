import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { format } from "prettier/standalone";
import prettierPluginTypeScript from "prettier/plugins/typescript";
import prettierPluginEstree from "prettier/plugins/estree";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Loader2, Copy, Check } from "lucide-react";
import { Badge } from "./badge";
import { Button } from "./button";
import { useUIStore } from "@/stores/ui-store";

interface ScriptDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: string;
  code: string;
  state: "call" | "executing" | "progress" | "result" | "error";
  progressMessages?: string[];
  result?: any;
  error?: string;
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
}: ScriptDetailsDialogProps) {
  const {
    highlightedCode,
    highlightedResult,
    setHighlightedCode,
    setHighlightedResult,
  } = useUIStore();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const copyToClipboard = async (text: string, type: "code" | "result") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedResult(true);
        setTimeout(() => setCopiedResult(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

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
          theme: "github-dark",
          mergeWhitespaces: false,
        });
        setHighlightedCode(highlighted);
      })();
    }
  }, [open, code]);

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
      <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{purpose}</span>
            <Badge>{getStateLabel()}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="space-y-4 h-full">
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

            {/* Code and Result Side by Side */}
            <div className="grid grid-cols-2 gap-4 h-full min-h-0">
              {/* Script Code - Left */}
              <div className="flex flex-col min-h-0 h-[80vh]">
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
                <div className="flex-1 flex text-[11px]">
                  {highlightedCode ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: highlightedCode }}
                      className="overflow-auto relative flex-1 [&>pre]:absolute [&>pre]:p-4 [&>pre>code]:whitespace-pre-wrap  [&>pre]:bg-[#0d1117]"
                    />
                  ) : (
                    <pre className="p-4 bg-[#0d1117] overflow-auto">
                      <code>{code}</code>
                    </pre>
                  )}
                </div>
              </div>

              {/* Result/Error - Right */}
              <div className="flex flex-col min-h-0">
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
                    <div className="flex-1 flex text-[11px]">
                      {highlightedResult ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: highlightedResult,
                          }}
                          className="overflow-auto relative flex-1 [&>pre]:absolute [&>pre]:p-4 [&>pre>code]:whitespace-pre-wrap  [&>pre]:bg-[#0d1117]"
                        />
                      ) : (
                        <pre className="p-4 bg-[#0d1117]  overflow-x-auto">
                          <code>
                            {typeof result === "string"
                              ? result
                              : JSON.stringify(result, null, 2)}
                          </code>
                        </pre>
                      )}
                    </div>
                  </>
                )}

                {error && (
                  <>
                    <h3 className="text-sm font-semibold mb-2 text-red-600 dark:text-red-400">
                      Error
                    </h3>
                    <div className="flex-1 rounded-md border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 p-3 overflow-auto">
                      <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
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
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
