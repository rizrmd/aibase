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
import { FileIcon, Trash2, Download, MessageSquare, AlertCircle, Edit3, CheckSquare, Square, Search, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  fetchProjectFiles,
  deleteFile,
  renameFile,
  formatFileSize,
  getFileIcon,
  type FileInfo,
} from "@/lib/files-api";
import { useConvId } from "@/lib/conv-id";
import { useChatStore } from "@/stores/chat-store";
import { Input } from "@/components/ui/input";
import { FilePreviewDialog } from "@/components/ui/file-preview-dialog";

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
  const [renamingFile, setRenamingFile] = useState<FileInfo | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'audio' | 'document' | 'code'>('all');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

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

  const handleRenameFile = (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation(); // Prevent card click
    setRenamingFile(file);
    setNewFileName(file.name);
  };

  const confirmRename = async () => {
    if (!renamingFile || !projectId || !newFileName.trim()) return;

    try {
      await renameFile(projectId, renamingFile.convId, renamingFile.name, newFileName.trim());
      toast.success("File renamed successfully");
      // Reload files
      loadFiles(projectId);
    } catch (error) {
      console.error("Error renaming file:", error);
      toast.error(error instanceof Error ? error.message : "Failed to rename file");
    } finally {
      setRenamingFile(null);
      setNewFileName("");
    }
  };

  const toggleFileSelection = (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation(); // Prevent card click
    const fileKey = `${file.convId}-${file.name}`;
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileKey)) {
      newSelected.delete(fileKey);
    } else {
      newSelected.add(fileKey);
    }
    setSelectedFiles(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      const allKeys = new Set(filteredFiles.map(f => `${f.convId}-${f.name}`));
      setSelectedFiles(allKeys);
    }
  };

  const confirmBulkDelete = async () => {
    if (!projectId || selectedFiles.size === 0) return;

    try {
      // Delete all selected files
      await Promise.all(
        Array.from(selectedFiles).map(async (fileKey) => {
          const file = files.find(f => `${f.convId}-${f.name}` === fileKey);
          if (file) {
            return deleteFile(projectId, file.convId, file.name);
          }
        })
      );
      toast.success(`Deleted ${selectedFiles.size} file(s)`);
      setSelectedFiles(new Set());
      loadFiles(projectId);
    } catch (error) {
      console.error("Error deleting files:", error);
      toast.error("Failed to delete some files");
    }
  };

  const handleDownloadFile = (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation(); // Prevent card click

    // Open file URL in new tab for download
    window.open(file.url, "_blank");
  };

  const handleFileClick = (file: FileInfo) => {
    // Find the index in filtered files
    const index = filteredFiles.findIndex(f => f.convId === file.convId && f.name === file.name);
    if (index !== -1) {
      setPreviewIndex(index);
      setPreviewOpen(true);
    }
  };

  const handleGoToConversation = (e: React.MouseEvent, file: FileInfo) => {
    e.stopPropagation(); // Prevent card click
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

  // Get file type category for filtering
  const getFileTypeCategory = (fileName: string): 'image' | 'video' | 'audio' | 'document' | 'code' | 'other' => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
    const documentExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
    const codeExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'md'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (documentExts.includes(ext)) return 'document';
    if (codeExts.includes(ext)) return 'code';
    return 'other';
  };

  // Filter files based on search query and file type
  const filteredFiles = files.filter((file) => {
    const matchesSearch = searchQuery === '' ||
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getConversationTitle(file.convId).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === 'all' || getFileTypeCategory(file.name) === filterType;

    return matchesSearch && matchesType;
  });

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

        {/* Bulk Actions Header */}
        {files.length > 0 && (
          <>
            {/* Search and Filter Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files by name or conversation..."
                  className="pl-10"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="all">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="document">Documents</option>
                <option value="code">Code</option>
              </select>
            </div>

            {/* Bulk Actions Bar */}
            {(selectedFiles.size > 0 || searchQuery || filterType !== 'all') && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="gap-2"
                  >
                    {selectedFiles.size === filteredFiles.length ? (
                      <CheckSquare className="size-4" />
                    ) : (
                      <Square className="size-4" />
                    )}
                    {selectedFiles.size === filteredFiles.length ? "Deselect All" : "Select All"}
                  </Button>
                  {selectedFiles.size > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {selectedFiles.size} selected
                    </span>
                  )}
                  {filteredFiles.length !== files.length && (
                    <span className="text-sm text-muted-foreground">
                      Showing {filteredFiles.length} of {files.length} files
                    </span>
                  )}
                </div>
                {selectedFiles.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={confirmBulkDelete}
                    className="gap-2"
                  >
                    <Trash2 className="size-4" />
                    Delete Selected ({selectedFiles.size})
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {/* Files List */}
        {files.length > 0 ? (
          <div className="overflow-auto relative flex-1">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 absolute inset-0 overflow-y-auto">
              {filteredFiles.length > 0 ? (
                filteredFiles.map((file, index) => {
                  // Additional safety check before rendering
                  if (!file || !file.name) {
                    console.warn(`[FilesPage] Skipping invalid file at index ${index}:`, file);
                    return null;
                  }

                  return (
                    <Card
                      key={`${file.convId}-${file.name}-${index}`}
                      className="cursor-pointer transition-all hover:shadow-lg group p-4 flex flex-col gap-3"
                      onClick={() => handleFileClick(file)}
                    >
                      <CardHeader className="min-h-0 h-auto p-0 flex-1">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start gap-2 w-full">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => toggleFileSelection(e, file)}
                              className="flex-shrink-0"
                              title="Select file"
                            >
                              {selectedFiles.has(`${file.convId}-${file.name}`) ? (
                                <CheckSquare className="size-4" />
                              ) : (
                                <Square className="size-4" />
                              )}
                            </Button>
                            <div className="text-4xl flex-1 flex items-center justify-center min-h-24 bg-muted rounded-lg">
                              {getFileIcon(file.name)}
                            </div>
                            <div className="flex-1 min-w-0 w-full">
                              <CardTitle className="text-sm line-clamp-2 break-all">
                                {file.name}
                              </CardTitle>
                              <CardDescription className="flex flex-col gap-1 mt-1 text-xs">
                                <span>{formatFileSize(file.size)}</span>
                                <span>{formatRelativeTime(file.uploadedAt)}</span>
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="size-3" />
                                  {getConversationTitle(file.convId)}
                                </span>
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                              onClick={(e) => handleRenameFile(e, file)}
                              title="Rename file"
                            >
                              <Edit3 className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleGoToConversation(e, file)}
                              title="Go to conversation"
                            >
                              <ExternalLink className="size-4" />
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
                })
              ) : (
                <div className="text-center h-full flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                    <Search className="size-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-medium">No files match your search</p>
                    <p className="text-muted-foreground">
                      Try adjusting your search or filters
                    </p>
                    {(searchQuery || filterType !== 'all') && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchQuery('');
                          setFilterType('all');
                        }}
                      >
                        Clear Filters
                      </Button>
                    )}
                  </div>
                </div>
              )}
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

        {/* Rename Dialog */}
        <Dialog open={!!renamingFile} onOpenChange={(open) => !open && setRenamingFile(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rename File</DialogTitle>
              <DialogDescription>
                Enter a new name for "{renamingFile?.name}"
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="Enter new file name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    confirmRename();
                  } else if (e.key === "Escape") {
                    setRenamingFile(null);
                  }
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenamingFile(null)}>
                Cancel
              </Button>
              <Button onClick={confirmRename} disabled={!newFileName.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File Preview Dialog */}
        <FilePreviewDialog
          files={filteredFiles}
          initialIndex={previewIndex}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          getConversationTitle={getConversationTitle}
        />
      </div>
    </FilesErrorBoundary>
  );
}
