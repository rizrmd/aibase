/**
 * Embed Dialog Component
 * Dialog for managing project embedding with code generation
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Label } from "./label";
import { Input } from "./input";
import { Button } from "./button";
import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import {
  updateEmbedCss,
  generateIframeCode,
  generateJavaScriptCode,
} from "@/lib/embed-api";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface EmbedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function EmbedDialog({ open, onOpenChange, projectId }: EmbedDialogProps) {
  const { currentProject } = useProjectStore();
  const [embedToken, setEmbedToken] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [width, setWidth] = useState("400px");
  const [height, setHeight] = useState("600px");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeType, setCodeType] = useState<"iframe" | "javascript">("iframe");

  // Load embed settings when dialog opens
  useEffect(() => {
    if (open && currentProject) {
      setEmbedToken(currentProject.id);
      setCustomCss(currentProject.custom_embed_css || "");
      setError("");
    }
  }, [open, currentProject]);

  const handleSaveCss = async () => {
    setIsLoading(true);
    setError("");
    try {
      await updateEmbedCss(projectId, customCss);

      // Update project in store
      if (currentProject) {
        useProjectStore.getState().setCurrentProject({
          ...currentProject,
          custom_embed_css: customCss,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save CSS");
    } finally {
      setIsLoading(false);
    }
  };

  const embedCode = embedToken
    ? codeType === "iframe"
      ? generateIframeCode(projectId, embedToken, width, height)
      : generateJavaScriptCode(projectId, embedToken, width, height)
    : "";

  const { isCopied, handleCopy } = useCopyToClipboard({
    text: embedCode,
    copyMessage: "Copied embed code to clipboard!",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Embed Chat</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Embed Token Display */}
          <div className="space-y-2">
            <Label htmlFor="embed-token">Embed Token</Label>
            <div className="flex gap-2">
              <Input
                id="embed-token"
                value={embedToken}
                readOnly
                className="font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The embed token is the project ID. This token is used to access your embedded chat.
            </p>
          </div>

          {/* Custom CSS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="custom-css">Custom CSS (optional)</Label>
              <Button
                onClick={handleSaveCss}
                disabled={isLoading}
                variant="outline"
                size="sm"
              >
                Save CSS
              </Button>
            </div>
            <textarea
              id="custom-css"
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              placeholder="/* Add custom CSS to style the embedded chat */&#10;.chat-container {&#10;  background: #f5f5f5;&#10;}"
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Custom CSS is saved in project configuration and applied automatically. Limited to 10KB.
            </p>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="400px"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="600px"
              />
            </div>
          </div>

          {/* Code Type Selector */}
          <div className="space-y-2">
            <Label>Embed Code Type</Label>
            <div className="flex gap-2">
              <Button
                onClick={() => setCodeType("iframe")}
                variant={codeType === "iframe" ? "default" : "outline"}
                size="sm"
              >
                iframe
              </Button>
              <Button
                onClick={() => setCodeType("javascript")}
                variant={codeType === "javascript" ? "default" : "outline"}
                size="sm"
              >
                JavaScript
              </Button>
            </div>
          </div>

          {/* Generated Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Embed Code</Label>
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="h-8"
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <textarea
              readOnly
              value={embedCode}
              onClick={(e) => e.currentTarget.select()}
              className="w-full min-h-[180px] rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Click the code to select all, then copy and paste into your website.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
