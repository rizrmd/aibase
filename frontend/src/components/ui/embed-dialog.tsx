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
import { buildApiUrl } from "@/lib/base-path";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Checkbox } from "./checkbox";

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
  const [showHistory, setShowHistory] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [userMode, setUserMode] = useState<"current" | "uid">("current");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [codeType, setCodeType] = useState<"iframe" | "javascript">("iframe");

  // Load embed settings when dialog opens
  useEffect(() => {
    if (open && currentProject) {
      setEmbedToken(currentProject.id);
      setCustomCss(currentProject.custom_embed_css || "");
      setShowHistory(currentProject.show_history ?? false);
      setShowFiles(currentProject.show_files ?? false);
      setShowContext(currentProject.show_context ?? false);
      setShowMemory(currentProject.show_memory ?? false);
      setUserMode(currentProject.use_client_uid ? "uid" : "current");
      setError("");
    }
  }, [open, currentProject]);

  const handleSaveConfig = async () => {
    setIsLoading(true);
    setError("");
    try {
      // Save CSS and Config
      await updateEmbedCss(projectId, customCss);

      const configUpdates = {
        show_history: showHistory,
        show_files: showFiles,
        show_context: showContext,
        show_memory: showMemory,
        use_client_uid: userMode === "uid",
      };

      await useProjectStore.getState().updateProject(projectId, configUpdates);

      // Update project in store (updateProject action already does this for optimistic ui usually, but let's ensure)
      if (currentProject) {
        useProjectStore.getState().setCurrentProject({
          ...currentProject,
          custom_embed_css: customCss,
          ...configUpdates,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
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

        <div className="py-4">
          <Tabs defaultValue="config" className="w-[100%]">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="config">Config</TabsTrigger>
              <TabsTrigger value="css">CSS</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
            </TabsList>

            {error && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {/* CONFIG TAB */}
            <TabsContent value="config" className="space-y-6 pt-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-history"
                    checked={showHistory}
                    onCheckedChange={(c) => setShowHistory(c === true)}
                  />
                  <Label htmlFor="show-history">Show History (Recent chats)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-files"
                    checked={showFiles}
                    onCheckedChange={(c) => setShowFiles(c === true)}
                  />
                  <Label htmlFor="show-files">Show Files (Project knowledge)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-context"
                    checked={showContext}
                    onCheckedChange={(c) => setShowContext(c === true)}
                  />
                  <Label htmlFor="show-context">Show Context (System prompt)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-memory"
                    checked={showMemory}
                    onCheckedChange={(c) => setShowMemory(c === true)}
                  />
                  <Label htmlFor="show-memory">Show Memory (Persisted facts)</Label>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor="user-mode" className="font-semibold">User Identification</Label>
                  <select
                    id="user-mode"
                    value={userMode}
                    onChange={(e) => setUserMode(e.target.value as "current" | "uid")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="current">Current User</option>
                    <option value="uid">By UID Param</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {userMode === "current" && "All embedded users share the same conversation history"}
                    {userMode === "uid" && "Each user has their own history by passing a unique uid parameter (uid=user123)"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveConfig} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </TabsContent>

            {/* CSS TAB */}
            <TabsContent value="css" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="custom-css">Custom CSS</Label>
                <textarea
                  id="custom-css"
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  placeholder="/* Add custom CSS to style the embedded chat */&#10;.chat-container {&#10;  background: #f5f5f5;&#10;}"
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Custom CSS is saved in project configuration and applied automatically. Limited to 10KB.
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveConfig} disabled={isLoading}>
                  {isLoading ? "Saving..." : "Save CSS"}
                </Button>
              </div>
            </TabsContent>

            {/* CODE TAB */}
            <TabsContent value="code" className="space-y-6 pt-4">
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

              {userMode === "uid" && (
                <div className="rounded-md bg-blue-50 p-4 mt-4">
                  <h4 className="font-semibold text-blue-900 mb-2 text-sm">Using UID Parameter for Persistent User History</h4>
                  <p className="text-xs text-blue-800 mb-2">
                    To maintain separate conversation history for each user, add a <code>uid</code> parameter to the embed URL.
                    The system will automatically create and persist history for each unique user ID.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-blue-800 font-semibold mb-1">For iframe:</p>
                      <pre className="text-xs text-blue-900 bg-blue-100 p-2 rounded overflow-x-auto">
{`<iframe
  src="${window.location.origin}${buildApiUrl("")}/embed?projectId=${projectId}&embedToken=${embedToken}&uid=USER_ID_HERE"
  width="${width}"
  height="${height}"
></iframe>`}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs text-blue-800 font-semibold mb-1">Example with dynamic user ID:</p>
                      <pre className="text-xs text-blue-900 bg-blue-100 p-2 rounded overflow-x-auto">
{`<!-- Replace USER_ID_HERE with your user's actual ID -->
<iframe
  src="${window.location.origin}${buildApiUrl("")}/embed?projectId=${projectId}&embedToken=${embedToken}&uid=user_123"
  width="${width}"
  height="${height}"
></iframe>`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {userMode === "current" && (
                <div className="rounded-md bg-amber-50 p-4 mt-4">
                  <h4 className="font-semibold text-amber-900 mb-2 text-sm">Shared Conversation Mode</h4>
                  <p className="text-xs text-amber-800">
                    All embedded users will share the same conversation history. To enable per-user history,
                    switch to "By UID Param" mode in the Config tab.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
