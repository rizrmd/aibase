import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Save, Zap } from "lucide-react";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";

const API_URL =
  (typeof window !== "undefined" && window.location.origin) ||
  "http://localhost:5040";

// Default project ID (could be made configurable later)
const PROJECT_ID = "A1";

export function ContextEditor() {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadContext = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/context?projectId=${PROJECT_ID}`
      );
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load context");
      }

      setContent(data.data.content);
      setOriginalContent(data.data.content);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      toast.error("Failed to load context", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/context`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, projectId: PROJECT_ID }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to save context");
      }

      setOriginalContent(content);
      toast.success("Context template saved successfully", {
        description: "The AI will use this context in new conversations",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to save context", {
        description: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm("Discard all unsaved changes?")) {
      setContent(originalContent);
      toast.info("Changes discarded");
    }
  };

  const handleResetToDefault = async () => {
    if (
      !confirm(
        "Reset to default template? This will discard all current content."
      )
    ) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/context/default`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load default template");
      }

      setContent(data.data.content);
      toast.success("Reset to default template", {
        description: "Don't forget to save your changes",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to reset to default", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContext();
  }, []);

  const hasChanges = content !== originalContent;

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-destructive">
              Error Loading Context
            </h3>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
          </div>
          <Button onClick={loadContext} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-end gap-4 shrink-0">
        {hasChanges && (
          <span className="text-sm text-amber-600 dark:text-amber-400">
            You have unsaved changes
          </span>
        )}
        <div className="flex gap-2">
          {hasChanges && (
            <Button
              onClick={handleReset}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              Discard Changes
            </Button>
          )}
          <Button
            onClick={handleResetToDefault}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            <Zap className="mr-1" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            size="sm"
            disabled={isSaving || !hasChanges || isLoading}
          >
            <Save />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Editor */}
      {isLoading && !content ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground">
            Loading context template...
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border">
          <CodeMirror
            value={content}
            extensions={[markdown()]}
            onChange={(value) => setContent(value)}
            theme="light"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
            }}
            style={{ height: "100%", fontSize: "14px" }}
          />
        </div>
      )}
    </div>
  );
}
