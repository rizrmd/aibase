import { useState, useEffect, useRef, useCallback } from "react";
import {
  PageActionButton,
  PageActionGroup,
} from "@/components/ui/page-action-button";
import { Save, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useProjectStore } from "@/stores/project-store";
import { buildApiUrl } from "@/lib/base-path";

const API_URL = buildApiUrl("");

export function ContextEditor() {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentProject } = useProjectStore();

  // Use refs to track latest state values for keyboard shortcut
  const contentRef = useRef(content);
  const originalContentRef = useRef(originalContent);
  const isSavingRef = useRef(isSaving);
  const isLoadingRef = useRef(isLoading);
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null);

  const loadContext = async () => {
    if (!currentProject) {
      setError("No project selected. Please select a project first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/context?projectId=${currentProject.id}`
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

  const handleSave = useCallback(async () => {
    if (!currentProject) {
      toast.error("No project selected");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/context`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, projectId: currentProject.id }),
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
  }, [currentProject, content]);

  // Update refs when state/handler changes
  useEffect(() => {
    contentRef.current = content;
    originalContentRef.current = originalContent;
    isSavingRef.current = isSaving;
    isLoadingRef.current = isLoading;
    handleSaveRef.current = handleSave;
  }, [content, originalContent, isSaving, isLoading, handleSave]);

  const handleReset = () => {
    setContent(originalContent);
    toast.info("Changes discarded");
  };

  const handleResetToDefault = async () => {
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
  }, [currentProject?.id]);

  const hasChanges = content !== originalContent;

  // Add keyboard shortcut for Ctrl/Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault(); // Prevent browser's default save dialog

        // Use refs to check latest state values (avoid stale closure)
        const hasChanges = contentRef.current !== originalContentRef.current;

        // Only save if there are changes and not already saving
        if (hasChanges && !isSavingRef.current && !isLoadingRef.current && handleSaveRef.current) {
          handleSaveRef.current();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // Empty deps - refs are updated separately

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
          <PageActionButton
            icon={RefreshCw}
            label="Retry"
            onClick={loadContext}
            variant="outline"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 px-4 pt-[60px] md:px-6 pb-4 w-full max-w-full min-w-0">

      {/* Header */}
      <div className="flex items-center justify-end gap-4 shrink-0">
        {hasChanges && (
          <span className="text-sm text-amber-600 dark:text-amber-400">
            You have unsaved changes
          </span>
        )}
        <PageActionGroup isFixedOnMobile={true}>
          {hasChanges && (
            <PageActionButton
              icon={RefreshCw}
              label="Discard Changes"
              onClick={handleReset}
              variant="outline"
              size="sm"
              disabled={isLoading}
              confirmMessage="Discard all unsaved changes?"
            />
          )}
          <PageActionButton
            icon={Zap}
            label="Reset"
            onClick={handleResetToDefault}
            variant="outline"
            size="sm"
            disabled={isLoading}
            isLoading={isLoading}
            confirmMessage="Reset to default template? This will discard all current content."
          />
          <PageActionButton
            icon={Save}
            label="Save Changes"
            onClick={handleSave}
            size="sm"
            disabled={!hasChanges || isLoading}
            isLoading={isSaving}
            loadingText="Saving..."
          />
        </PageActionGroup>
      </div>

      {/* Editor */}
      {isLoading && !content ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground">
            Loading context template...
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-lg border min-h-0 w-full max-w-full">
          <CodeMirror
            value={content}
            height="100%"
            extensions={[markdown()]}
            onChange={(value) => setContent(value)}
            theme="light"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
            }}
            style={{ fontSize: "14px" }}
          />
        </div>
      )}
    </div>
  );
}
