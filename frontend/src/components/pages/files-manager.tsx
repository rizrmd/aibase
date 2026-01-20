"use client";

import React from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/time-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useConversationStore } from "@/stores/conversation-store";
import { FileIcon, Trash2, Download, MessageSquare, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  fetchProjectFiles,
  deleteFile,
  formatFileSize,
  getFileIcon,
  type FileInfo,
} from "@/lib/files-api";
import { useConvId } from "@/lib/conv-id";
import { useChatStore } from "@/stores/chat-store";

// Error Boundary component to catch rendering errors
class FilesErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    console.error("[FilesPage] Rendering error:", error);
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[FilesPage] Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center px-4">
          <div className="max-w-md text-center space-y-4">
            <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="size-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground">
              Unable to load files page. Please try refreshing.
            </p>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function FilesManagerPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const { conversations, loadConversations } = useConversationStore();
  const { setConvId } = useConvId();
  const { clearMessages } = useChatStore();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingFile, setDeletingFile] = useState<FileInfo | null>(null);

  useEffect(() => {
    // Load conversations and files when component mounts
    if (projectId) {
      loadConversations(projectId);
      loadFiles(projectId);
    }
  }, [projectId, loadConversations]);

  const loadFiles = async (projectId: string) => {
    setIsLoading(true);
    try {
      console.log("[FilesPage] Loading files for project:", projectId);
      const projectFiles = await fetchProjectFiles(projectId);

      console.log("[FilesPage] Raw response from API:", projectFiles);

      // Validate response data
      if (!Array.isArray(projectFiles)) {
        console.error("[FilesPage] Invalid files response:", projectFiles);
        throw new Error("Invalid files data received from server");
      }

      console.log(`[FilesPage] Response is array with ${projectFiles.length} items`);

      // Validate each file object
      const validFiles = projectFiles.filter((file) => {
        console.log("[FilesPage] Checking file:", file);
        const isValid = file && typeof file === 'object' &&
          file.name && typeof file.name === 'string' &&
          file.size && typeof file.size === 'number' &&
          file.convId && typeof file.convId === 'string';

        if (!isValid) {
          console.warn("[FilesPage] Invalid file object, filtering out:", file);
        }
        return isValid;
      });

      console.log(`[FilesPage] Loaded ${validFiles.length} valid files (${projectFiles.length} total received)`);

      setFiles(validFiles);
    } catch (error) {
      console.error("[FilesPage] Error loading files:", error);
      toast.error("Failed to load files", {
        description: error instanceof Error ? error.message : "Unknown error"
      });
      // Set empty array on error to prevent blank screen
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFile = (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation(); // Prevent card click
    setDeletingFile(file);
  };

  const confirmDelete = async () => {
    if (!deletingFile || !projectId) return;

    try {
      await deleteFile(projectId, deletingFile.convId, deletingFile.name);
      toast.success("File deleted successfully");
      // Reload files
      loadFiles(projectId);
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    } finally {
      setDeletingFile(null);
    }
  };

  const handleDownloadFile = (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation(); // Prevent card click

    // Open file URL in new tab for download
    window.open(file.url, "_blank");
  };

  const handleGoToConversation = (file: FileInfo) => {
    if (!projectId) return;

    // Set the conversation ID
    setConvId(file.convId);

    // Clear current messages (will be loaded by main-chat)
    clearMessages();

    // Navigate to chat page with the selected conversation
    navigate(`/projects/${projectId}/chat`);
  };

  // Get conversation title for a file
  const getConversationTitle = (convId: string): string => {
    const conversation = conversations.find((c) => c.convId === convId);
    return conversation?.title || "Unknown Conversation";
  };

  if (isLoading && files.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-medium">Loading files...</div>
        </div>
      </div>
    );
  }

  return (
    <FilesErrorBoundary>
      <div className="flex h-screen flex-col gap-4 px-4 pt-[60px] md:px-6 pb-4">

        {/* Files List */}
        {files.length > 0 ? (
          <div className="overflow-auto relative flex-1">
            <div className="p-4 space-y-3 absolute inset-0">
              {files.map((file, index) => {
                // Additional safety check before rendering
                if (!file || !file.name) {
                  console.warn(`[FilesPage] Skipping invalid file at index ${index}:`, file);
                  return null;
                }

                return (
                  <Card
                    key={`${file.convId}-${file.name}-${index}`}
                    className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.01] group pt-3 pb-1"
                    onClick={() => handleGoToConversation(file)}
                  >
                    <CardHeader className="min-h-0 h-auto">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1 text-2xl">
                            {getFileIcon(file.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base line-clamp-1 break-all">
                              {file.name}
                            </CardTitle>
                            <CardDescription className="flex flex-col gap-1 mt-1">
                              <span className="flex items-center gap-2">
                                <span>{formatFileSize(file.size)}</span>
                                <span>•</span>
                                <span>
                                  {formatRelativeTime(file.uploadedAt)}
                                </span>
                              </span>
                              <span className="flex items-center gap-1 text-xs">
                                <MessageSquare className="size-3" />
                                {getConversationTitle(file.convId)}
                              </span>
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDownloadFile(e, file)}
                            title="Download file"
                          >
                            <Download className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDeleteFile(e, file)}
                            title="Delete file"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center h-full flex flex-col items-center justify-center py-12 space-y-4 border rounded-lg bg-background/50 backdrop-blur">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <FileIcon className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium">No files uploaded yet</p>
              <p className="text-muted-foreground">
                Upload files in your conversations to see them here
              </p>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingFile} onOpenChange={(open) => !open && setDeletingFile(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete File</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deletingFile?.name}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingFile(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </FilesErrorBoundary>
  );
}
