"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import React from "react";

import {
  deleteFile,
  fetchProjectFiles,
  formatFileSize,
  renameFile,
  getFileContext,
  setFileInContext,
  type FileInfo,
  type FileContextMapping,
} from "@/lib/files-api";
import { uploadFilesWithProgress, type UploadProgress } from "@/lib/file-upload";
import { useChatStore } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useFileContextStore } from "@/stores/file-context-store";
import {
  AlertCircle,
  Download,
  Edit3,
  ExternalLink,
  FileIcon,
  FileText,
  FileImage,
  FileCode,
  File as FileDefault,
  Folder,
  Grid,
  List,
  MoreVertical,
  Search,
  Trash2,
  X,
  Eye,
  Upload,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

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
        <div className="flex h-screen-mobile items-center justify-center px-4">
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

type ViewMode = "list" | "grid";

export function FilesManagerPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const { loadConversations } = useConversationStore();
  const { clearMessages } = useChatStore();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingFile, setDeletingFile] = useState<FileInfo | null>(null);
  const [renamingFile, setRenamingFile] = useState<FileInfo | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "image" | "video" | "audio" | "document" | "code"
  >("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // File context state
  const [fileContext, setFileContext] = useState<FileContextMapping>({});
  const [fileContextLoading, setFileContextLoading] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) {
      loadConversations(projectId);
      loadFiles(projectId);
      loadFileContext(projectId);
    }
  }, [projectId, loadConversations]);

  const loadFiles = async (projectId: string) => {
    setIsLoading(true);
    try {
      const projectFiles = await fetchProjectFiles(projectId);

      if (!Array.isArray(projectFiles)) {
        throw new Error("Invalid files data received from server");
      }

      const validFiles = projectFiles.filter((file) => {
        return (
          file &&
          typeof file === "object" &&
          file.name &&
          typeof file.name === "string" &&
          file.size &&
          typeof file.size === "number"
        );
      });

      setFiles(validFiles);
    } catch (error) {
      console.error("[FilesPage] Error loading files:", error);
      toast.error("Failed to load files", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileContext = async (projectId: string) => {
    setFileContextLoading(true);
    try {
      const data = await getFileContext(projectId);
      setFileContext(data.fileContext);
    } catch (error) {
      console.error("[FilesPage] Error loading file context:", error);
      // Don't show toast for this error, just log it
      setFileContext({});
    } finally {
      setFileContextLoading(false);
    }
  };

  const handleDeleteFile = (file: FileInfo) => {
    setDeletingFile(file);
  };

  const confirmDelete = async () => {
    if (!deletingFile || !projectId) return;

    try {
      await deleteFile(projectId, deletingFile.name);
      toast.success("File deleted successfully");
      loadFiles(projectId);
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    } finally {
      setDeletingFile(null);
    }
  };

  const handleRenameFile = (file: FileInfo) => {
    setRenamingFile(file);
    setNewFileName(file.name);
  };

  const confirmRename = async () => {
    if (!renamingFile || !projectId || !newFileName.trim()) return;

    try {
      await renameFile(
        projectId,
        renamingFile.name,
        newFileName.trim(),
      );
      toast.success("File renamed successfully");
      loadFiles(projectId);
    } catch (error) {
      console.error("Error renaming file:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to rename file",
      );
    } finally {
      setRenamingFile(null);
      setNewFileName("");
    }
  };

  const toggleSelection = (fileKey: string) => {
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
      const allKeys = new Set(
        filteredFiles.map((f) => `${f.name}`),
      );
      setSelectedFiles(allKeys);
    }
  };

  const confirmBulkDelete = async () => {
    if (!projectId || selectedFiles.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedFiles).map(async (fileKey) => {
          const file = files.find((f) => f.name === fileKey);
          if (file) {
            return deleteFile(projectId, file.name);
          }
        }),
      );
      toast.success(`Deleted ${selectedFiles.size} file(s)`);
      setSelectedFiles(new Set());
      loadFiles(projectId);
    } catch (error) {
      console.error("Error deleting files:", error);
      toast.error("Failed to delete some files");
    }
  };

  const handleToggleFileContext = async (fileId: string, included: boolean) => {
    if (!projectId) return;

    setFileContext((prev) => ({ ...prev, [fileId]: included }));

    try {
      await setFileInContext(projectId, fileId, included);
      // No toast needed, the visual checkbox update is sufficient feedback
    } catch (error) {
      console.error("Error toggling file context:", error);
      // Revert the change on error
      setFileContext((prev) => ({ ...prev, [fileId]: !included }));
      toast.error("Failed to update file context");
    }
  };

  const handleDownloadFile = (file: FileInfo) => {
    window.open(file.url, "_blank");
  };

  const handleFileClick = (file: FileInfo) => {
    navigate(`/projects/${projectId}/files/${encodeURIComponent(file.name)}`);
  };

  const handleGoToConversation = () => {
    if (!projectId) return;

    clearMessages();
    navigate(`/projects/${projectId}/chat`);
  };

  // Upload handlers
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && projectId) {
      const filesArray = Array.from(files);
      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Upload directly to project storage (no convId = project-level files)
        await uploadFilesWithProgress(filesArray, {
          projectId,
          // No convId - uploads to project storage
          onProgress: (progress: UploadProgress) => {
            setUploadProgress(progress.percentage);
          },
        });

        toast.success("Files uploaded successfully to project storage");

        // Refresh files list with cache-busting
        const freshFiles = await fetchProjectFiles(projectId, true);
        const validFiles = freshFiles.filter((file) => {
          return (
            file &&
            typeof file === "object" &&
            file.name &&
            typeof file.name === "string" &&
            file.size &&
            typeof file.size === "number"
          );
        });
        setFiles(validFiles);
      } catch (error) {
        console.error("Error uploading files:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to upload files"
        );
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    }
    // Reset input value to allow selecting the same files again
    e.target.value = "";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && projectId) {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Upload directly to project storage (no convId = project-level files)
        await uploadFilesWithProgress(files, {
          projectId,
          // No convId - uploads to project storage
          onProgress: (progress: UploadProgress) => {
            setUploadProgress(progress.percentage);
          },
        });

        toast.success("Files uploaded successfully to project storage");

        // Refresh files list with cache-busting
        const freshFiles = await fetchProjectFiles(projectId, true);
        const validFiles = freshFiles.filter((file) => {
          return (
            file &&
            typeof file === "object" &&
            file.name &&
            typeof file.name === "string" &&
            file.size &&
            typeof file.size === "number"
          );
        });
        setFiles(validFiles);
      } catch (error) {
        console.error("Error uploading files:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to upload files"
        );
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    }
  };

  const getFileTypeCategory = (
    fileName: string,
  ): "image" | "video" | "audio" | "document" | "code" | "other" => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const imageExts = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
    const videoExts = ["mp4", "avi", "mov", "wmv", "flv", "webm"];
    const audioExts = ["mp3", "wav", "ogg", "m4a", "flac"];
    const documentExts = ["pdf", "doc", "docx", "txt", "rtf", "odt"];
    const codeExts = [
      "js",
      "ts",
      "tsx",
      "jsx",
      "py",
      "java",
      "cpp",
      "c",
      "html",
      "css",
      "json",
      "md",
    ];

    if (imageExts.includes(ext)) return "image";
    if (videoExts.includes(ext)) return "video";
    if (audioExts.includes(ext)) return "audio";
    if (documentExts.includes(ext)) return "document";
    if (codeExts.includes(ext)) return "code";
    return "other";
  };

  const getFileIconComponent = (fileName: string) => {
    const category = getFileTypeCategory(fileName);
    switch (category) {
      case "image":
        return <FileImage className="h-5 w-5 text-green-500" />;
      case "video":
        return <FileVideoIcon className="h-5 w-5 text-purple-500" />;
      case "audio":
        return <FileAudioIcon className="h-5 w-5 text-orange-500" />;
      case "document":
        if (fileName.toLowerCase().endsWith(".pdf")) {
          return <FilePdfIcon className="h-5 w-5 text-red-500" />;
        }
        return <FileText className="h-5 w-5 text-yellow-500" />;
      case "code":
        return <FileCode className="h-5 w-5 text-purple-500" />;
      default:
        return <FileDefault className="h-5 w-5 text-gray-500" />;
    }
  };

  const filteredFiles = files.filter((file) => {
    const matchesSearch =
      searchQuery === "" ||
      file.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      filterType === "all" || getFileTypeCategory(file.name) === filterType;

    return matchesSearch && matchesType;
  });

  if (isLoading && files.length === 0) {
    return (
      <div className="flex h-screen-mobile items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-medium">Loading files...</div>
        </div>
      </div>
    );
  }

  return (
    <FilesErrorBoundary>
      <div
        className="flex flex-col h-full"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="w-full flex-1 flex flex-col pt-0">
          <div className="flex flex-col sticky top-0 z-20 px-5 bg-white pt-3 space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
            {/* Breadcrumbs */}
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Folder className="h-4 w-4" />
              <span className="font-medium text-foreground">Project Files</span>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search files..."
                  className="w-full pl-8 h-9 md:w-[200px] lg:w-[300px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as "all" | "image" | "video" | "audio" | "document" | "code")}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="all">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="document">Documents</option>
                <option value="code">Code</option>
              </select>

              <Button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="h-9"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadProgress > 0 ? `${uploadProgress}%` : "Uploading..."}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />

              <div className="hidden md:flex border rounded-md">
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-r-none"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                  <span className="sr-only">List view</span>
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-l-none"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid className="h-4 w-4" />
                  <span className="sr-only">Grid view</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedFiles.size > 0 && (
            <div className="bg-muted/50 px-4 py-1.5 flex items-center justify-between border-b sticky top-[57px] z-20">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFiles(new Set())}
                >
                  <X className="h-4 w-4 mr-2" />
                  Deselect
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedFiles.size} item{selectedFiles.size !== 1 ? "s" : ""}{" "}
                  selected
                </span>
                {filteredFiles.length !== files.length && (
                  <span className="text-sm text-muted-foreground">
                    Showing {filteredFiles.length} of {files.length} files
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={confirmBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedFiles.size})
                </Button>
              </div>
            </div>
          )}

          <div className="p-0 flex-1 flex flex-col">
            {files.length > 0 ? (
              <>
                {viewMode === "list" ? (
                  /* List View */
                  filteredFiles.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={
                                selectedFiles.size === filteredFiles.length &&
                                filteredFiles.length > 0
                              }
                              onCheckedChange={toggleSelectAll}
                              aria-label="Select all"
                            />
                          </TableHead>
                          <TableHead className="w-[50px]" title="Include in AI context">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center justify-center">
                                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Include in AI context</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableHead>
                          <TableHead className="w-[300px]">Name</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Conversation</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFiles.map((file) => {
                          const fileKey = `${file.name}`;
                          return (
                            <TableRow
                              key={fileKey}
                              className={
                                selectedFiles.has(fileKey) ? "bg-muted/50" : ""
                              }
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedFiles.has(fileKey)}
                                  onCheckedChange={() =>
                                    toggleSelection(fileKey)
                                  }
                                  aria-label={`Select ${file.name}`}
                                />
                              </TableCell>
                              <TableCell>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-7 w-7 ${
                                          !!fileContext[file.id || `file_${file.uploadedAt}_${file.name}`]
                                            ? "text-amber-500 hover:text-amber-600"
                                            : "text-muted-foreground hover:text-foreground"
                                        }`}
                                        onClick={() =>
                                          handleToggleFileContext(
                                            file.id || `file_${file.uploadedAt}_${file.name}`,
                                            !fileContext[file.id || `file_${file.uploadedAt}_${file.name}`]
                                          )
                                        }
                                        disabled={fileContextLoading}
                                      >
                                        <Sparkles className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {!!fileContext[file.id || `file_${file.uploadedAt}_${file.name}`]
                                          ? "Remove from AI context"
                                          : "Include in AI context"}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell>
                                <div
                                  className="flex items-center space-x-2 cursor-pointer"
                                  onClick={() => handleFileClick(file)}
                                >
                                  {getFileIconComponent(file.name)}
                                  <div className="flex flex-col">
                                    <span className="font-medium">
                                      {file.title || file.name}
                                    </span>
                                    {file.title && file.title !== file.name && (
                                      <span className="text-xs text-muted-foreground">
                                        {file.name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{formatFileSize(file.size)}</TableCell>
                              <TableCell>
                                <span className="text-sm text-muted-foreground">
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {getFileTypeCategory(file.name)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                      <span className="sr-only">Actions</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => handleFileClick(file)}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      Preview
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDownloadFile(file)}
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      Download
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleRenameFile(file)}
                                    >
                                      <Edit3 className="h-4 w-4 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleGoToConversation()
                                      }
                                    >
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      Go to Conversation
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteFile(file)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="rounded-full bg-muted p-3">
                        <Search className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold">
                        No files found
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                        {searchQuery
                          ? `No results found for "${searchQuery}". Try a different search term.`
                          : filterType !== "all"
                            ? `No ${filterType} files found.`
                            : "No files match your criteria."}
                      </p>
                      {(searchQuery || filterType !== "all") && (
                        <div className="mt-4 flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearchQuery("");
                              setFilterType("all");
                            }}
                          >
                            Clear Filters
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                ) : /* Grid View */
                filteredFiles.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
                    {filteredFiles.map((file) => {
                      const fileKey = `${file.name}`;
                      return (
                        <div
                          key={fileKey}
                          className={`relative group rounded-lg border bg-card p-2 transition-all hover:shadow-md ${
                            selectedFiles.has(fileKey)
                              ? "ring-2 ring-primary"
                              : ""
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <div className="absolute top-2 right-2">
                            <Checkbox
                              checked={selectedFiles.has(fileKey)}
                              onCheckedChange={() => toggleSelection(fileKey)}
                              aria-label={`Select ${file.name}`}
                              className="bg-background/80 backdrop-blur"
                            />
                          </div>

                          {/* File Context Toggle */}
                          <div className="absolute top-2 left-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-7 w-7 bg-background/80 backdrop-blur ${
                                      !!fileContext[file.id || `file_${file.uploadedAt}_${file.name}`]
                                        ? "text-amber-500 hover:text-amber-600"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                    onClick={() =>
                                      handleToggleFileContext(
                                        file.id || `file_${file.uploadedAt}_${file.name}`,
                                        !fileContext[file.id || `file_${file.uploadedAt}_${file.name}`]
                                      )
                                    }
                                    disabled={fileContextLoading}
                                  >
                                    <Sparkles className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {!!fileContext[file.id || `file_${file.uploadedAt}_${file.name}`]
                                      ? "Remove from AI context"
                                      : "Include in AI context"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          {/* Card Content */}
                          <div
                            className="flex flex-col items-center p-4 cursor-pointer"
                            onClick={() => handleFileClick(file)}
                          >
                            {/* Thumbnail/Icon */}
                            {file.thumbnailUrl ? (
                              <img
                                src={file.thumbnailUrl}
                                alt={file.name}
                                className="w-full h-24 object-cover rounded-lg bg-muted mb-2"
                                loading="lazy"
                              />
                            ) : (
                              <div className="text-4xl mb-2 flex items-center justify-center min-h-24 w-full bg-muted rounded-lg">
                                {getFileIconComponent(file.name)}
                              </div>
                            )}

                            {/* File Info */}
                            <div className="text-center w-full">
                              <p className="font-medium truncate w-full text-sm">
                                {file.title || file.name}
                              </p>
                              {file.title && file.title !== file.name && (
                                <p className="text-xs text-muted-foreground truncate w-full">
                                  {file.name}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatFileSize(file.size)}
                              </p>
                              <Badge
                                variant="outline"
                                className="mt-2 text-xs capitalize"
                              >
                                {getFileTypeCategory(file.name)}
                              </Badge>
                            </div>
                          </div>

                          {/* Actions Menu */}
                          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 bg-background/80 backdrop-blur"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFileClick(file);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadFile(file);
                                  }}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRenameFile(file);
                                  }}
                                >
                                  <Edit3 className="h-4 w-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGoToConversation();
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Go to Conversation
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFile(file);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="rounded-full bg-muted p-3">
                      <Search className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      No files found
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                      {searchQuery
                        ? `No results found for "${searchQuery}". Try a different search term.`
                        : filterType !== "all"
                          ? `No ${filterType} files found.`
                          : "No files match your criteria."}
                    </p>
                    {(searchQuery || filterType !== "all") && (
                      <div className="mt-4 flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchQuery("");
                            setFilterType("all");
                          }}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col flex-1 items-center justify-center py-12">
                <div className="rounded-full bg-muted p-3">
                  <FileIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">
                  No files uploaded yet
                </h3>
                <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                  Upload files directly here or in your conversations
                </p>
                <Button
                  className="mt-4"
                  onClick={handleUploadClick}
                  disabled={isUploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!deletingFile}
          onOpenChange={(open) => !open && setDeletingFile(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deletingFile?.name}"? This
                action cannot be undone.
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
        <Dialog
          open={!!renamingFile}
          onOpenChange={(open) => !open && setRenamingFile(null)}
        >
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

        {/* Drag and Drop Overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center space-x-2 bg-background/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden
            >
              <Upload className="h-8 w-8 text-primary" />
              <span className="text-lg font-medium">Drop files here to upload</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FilesErrorBoundary>
  );
}

// Helper icon components for video, audio and PDF files
function FileVideoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.46a2 2 0 0 1 1.11-1.79l.89-.51V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3.16l.89.51A2 2 0 0 1 22 8.46V14z" />
      <polygon points="10,8 16,11 16,5" />
    </svg>
  );
}

function FileAudioIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function FilePdfIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14,2 14,8 20,8" />
      <path d="M9 15v-2" />
      <path d="M9 12v-2" />
      <path d="M9 9v-2" />
      <path d="M15 15v-2" />
      <path d="M15 12v-2" />
      <path d="M15 9v-2" />
    </svg>
  );
}
