/**
 * Embed Settings Page
 * Full page for managing project embedding settings
 */

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildApiUrl } from "@/lib/base-path";
import { useProjectStore } from "@/stores/project-store";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const API_BASE_URL = buildApiUrl("");

export function EmbedSettings() {
  const { currentProject, updateProject } = useProjectStore();

  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [customCss, setCustomCss] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCoping, setIsCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeType, setCodeType] = useState<"iframe" | "javascript">("iframe");
  const [width, setWidth] = useState("400px");
  const [height, setHeight] = useState("600px");

  // Config state
  const [showHistory, setShowHistory] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [userMode, setUserMode] = useState<"current" | "uid">("current");

  // Load custom CSS
  const loadCustomCss = useCallback(async () => {
    if (!currentProject) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${currentProject.id}/embed/css`
      );
      const data = await response.json();

      if (data.success && data.data.customCss) {
        setCustomCss(data.data.customCss);
      }
    } catch (err) {
      console.error("Failed to load custom CSS:", err);
    }
  }, [currentProject]);



  // Load embed settings when project changes
  const loadEmbedSettings = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use project ID as embed token
      const token = currentProject.id;
      setEmbedToken(token);

      // Load config from project
      setShowHistory(currentProject.show_history ?? false);
      setShowFiles(currentProject.show_files ?? false);
      setShowContext(currentProject.show_context ?? false);
      setShowMemory(currentProject.show_memory ?? false);
      setUserMode(currentProject.use_client_uid ? "uid" : "current");

      await loadCustomCss();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load embed settings";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, loadCustomCss]);

  // Load embed settings when project changes
  useEffect(() => {
    if (currentProject) {
      loadEmbedSettings();
    }
  }, [currentProject, loadEmbedSettings]);

  const handleSaveConfig = async () => {
    if (!currentProject) return;

    setIsSaving(true);

    try {
      const configUpdates = {
        show_history: showHistory,
        show_files: showFiles,
        show_context: showContext,
        show_memory: showMemory,
        use_client_uid: userMode === "uid",
      };

      await updateProject(currentProject.id, configUpdates);
      toast.success("Configuration saved successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save configuration";
      setError(errorMessage);
      toast.error("Failed to save configuration", {
        description: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCustomCss = async () => {
    if (!currentProject) return;

    setIsSaving(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${currentProject.id}/embed/css`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customCss }),
        }
      );
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to save custom CSS");
      }

      toast.success("Custom CSS saved successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save custom CSS";
      setError(errorMessage);
      toast.error("Failed to save custom CSS", {
        description: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generateIframeCode = (): string => {
    if (!currentProject || !embedToken) return "";
    const basePath = buildApiUrl("");
    const baseUrl = window.location.origin;
    const embedUrl = `${baseUrl}${basePath}/embed?projectId=${encodeURIComponent(currentProject.id)}&embedToken=${encodeURIComponent(embedToken)}`;

    return `<iframe
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="microphone"
  style="border: 1px solid #ccc; border-radius: 8px;"
></iframe>`;
  };

  const generateJavaScriptCode = (): string => {
    if (!currentProject || !embedToken) return "";
    const basePath = buildApiUrl("");
    const baseUrl = window.location.origin;
    const embedUrl = `${baseUrl}${basePath}/embed?projectId=${encodeURIComponent(currentProject.id)}&embedToken=${encodeURIComponent(embedToken)}`;

    return `<div id="aibase-chat"></div>
<script>
(function() {
  const iframe = document.createElement('iframe');
  iframe.src = '${embedUrl}';
  iframe.width = '${width}';
  iframe.height = '${height}';
  iframe.frameBorder = '0';
  iframe.allow = 'microphone';
  iframe.style.cssText = 'border: 1px solid #ccc; border-radius: 8px;';
  document.getElementById('aibase-chat').appendChild(iframe);
})();
<\/script>`;
  };

  const embedCode = embedToken
    ? codeType === "iframe"
      ? generateIframeCode()
      : generateJavaScriptCode()
    : "";

  const handleCopyCode = async () => {
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(embedCode);
      toast.success("Embed code copied to clipboard!");
      setTimeout(() => setIsCopying(false), 2000);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
      setIsCopying(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No project selected. Please select a project first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 pt-14 mb-4">
      {error && (
        <Alert variant="destructive">
          <p className="text-sm">{error}</p>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground ml-4">Loading embed settings...</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-[100px]">
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="config">Config</TabsTrigger>
              <TabsTrigger value="css">CSS</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
            </TabsList>

            {/* CONFIG TAB */}
            <TabsContent value="config" className="space-y-6 pt-4">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Display Options</h2>
                <p className="text-sm text-muted-foreground">
                  Configure which features are visible in the embedded chat interface.
                </p>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-history"
                    checked={showHistory}
                    onCheckedChange={(c) => setShowHistory(c === true)}
                  />
                  <Label htmlFor="show-history">History</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-files"
                    checked={showFiles}
                    onCheckedChange={(c) => setShowFiles(c === true)}
                  />
                  <Label htmlFor="show-files">Files</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-context"
                    checked={showContext}
                    onCheckedChange={(c) => setShowContext(c === true)}
                  />
                  <Label htmlFor="show-context">Context</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-memory"
                    checked={showMemory}
                    onCheckedChange={(c) => setShowMemory(c === true)}
                  />
                  <Label htmlFor="show-memory">Memory</Label>
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
                <Button onClick={handleSaveConfig} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </TabsContent>

            {/* CSS TAB */}
            <TabsContent value="css" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="custom-css">Custom CSS</Label>
                <p className="text-sm text-muted-foreground">
                  Add custom CSS to style the embedded chat widget. Max 10KB.
                </p>
                <textarea
                  id="custom-css"
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  placeholder={`/* Example CSS */
.aibase-chat-container {
  background-color: #f5f5f5;
}
.aibase-chat-input {
  border-radius: 8px;
}`}
                  maxLength={10240}
                  rows={15}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {customCss.length}/10240
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveCustomCss} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save CSS"}
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
                    value={embedToken || ""}
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
                    onClick={handleCopyCode}
                    variant="outline"
                    size="sm"
                    className="h-8"
                  >
                    {isCoping ? (
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
  src="${window.location.origin}${buildApiUrl("")}/embed?projectId=${currentProject.id}&embedToken=${embedToken}&uid=USER_ID_HERE"
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
  src="${window.location.origin}${buildApiUrl("")}/embed?projectId=${currentProject.id}&embedToken=${embedToken}&uid=user_123"
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
      )}
    </div>
  );
}
