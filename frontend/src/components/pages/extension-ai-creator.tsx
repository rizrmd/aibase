/**
 * AI Extension Creator Page
 * Generate extensions using AI by describing what you want
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/stores/project-store";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createExtension } from "@/lib/api/extensions";
import {
  ArrowLeft,
  Loader2,
  Code,
  Check,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";

interface GeneratedExtension {
  metadata: {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    category: string;
    enabled: boolean;
    isDefault: boolean;
    createdAt: number;
    updatedAt: number;
  };
  code: string;
}

export function ExtensionAICreator() {
  const { currentProject } = useProjectStore();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedExtension, setGeneratedExtension] =
    useState<GeneratedExtension | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleBack = () => {
    if (!currentProject) return;
    navigate(`/projects/${currentProject.id}/extensions`);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please describe what extension you want");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/extensions/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate extension");
      }

      const data = await response.json();
      setGeneratedExtension(data.data.extension);
      toast.success("Extension generated successfully!");
    } catch (error) {
      console.error("Failed to generate extension:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate extension"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!currentProject || !generatedExtension) return;

    setIsSaving(true);
    try {
      await createExtension(currentProject.id, {
        id: generatedExtension.metadata.id,
        name: generatedExtension.metadata.name,
        description: generatedExtension.metadata.description,
        author: generatedExtension.metadata.author,
        version: generatedExtension.metadata.version,
        code: generatedExtension.code,
        enabled: true,
      });

      toast.success("Extension created successfully!");
      navigate(`/projects/${currentProject.id}/extensions`);
    } catch (error: any) {
      console.error("Failed to save extension:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save extension"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedExtension(null);
    handleGenerate();
  };

  return (
    <div className="space-y-6 px-4 pt-[60px] md:px-6 pb-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-purple-500" />
            AI Extension Creator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Describe what you want and AI will create the extension for you
          </p>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="prompt">Describe your extension</Label>
          <textarea
            id="prompt"
            placeholder="e.g., I want an extension that can query GitHub API to get repository information, list commits, and show file details..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            className="mt-1.5 w-full px-3 py-2 border rounded-md resize-none bg-background"
            disabled={isGenerating || !!generatedExtension}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Be specific about what the extension should do. AI will generate the
            code and metadata.
          </p>
        </div>

        {!generatedExtension && (
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Extension
              </>
            )}
          </Button>
        )}
      </div>

      {/* Generated Extension Preview */}
      {generatedExtension && (
        <div className="space-y-6">
          {/* Success Message */}
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div className="flex-1">
              <p className="font-medium text-green-900 dark:text-green-100">
                Extension generated successfully!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Review the generated code below, then save to add it to your project.
              </p>
            </div>
          </div>

          {/* Extension Metadata */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Code className="w-4 h-4" />
              Extension Details
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="font-medium mt-0.5">
                  {generatedExtension.metadata.name}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">ID</Label>
                <p className="font-medium mt-0.5 font-mono text-xs">
                  {generatedExtension.metadata.id}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Category</Label>
                <p className="font-medium mt-0.5">
                  {generatedExtension.metadata.category}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Version</Label>
                <p className="font-medium mt-0.5">
                  {generatedExtension.metadata.version}
                </p>
              </div>
              <div className="col-span-2">
                <Label className="text-muted-foreground">Description</Label>
                <p className="font-medium mt-0.5">
                  {generatedExtension.metadata.description}
                </p>
              </div>
            </div>
          </div>

          {/* Code Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 border-b">
              <Label className="text-sm font-medium">
                Generated Code (TypeScript)
              </Label>
            </div>
            <div className="bg-background">
              <CodeMirror
                value={generatedExtension.code}
                height="400px"
                extensions={[javascript()]}
                readOnly
                theme="light"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={isGenerating}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Extension
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
