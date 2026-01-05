"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/time-utils";

import { useConversationStore } from "@/stores/conversation-store";
import { FileIcon, Trash2, Download, MessageSquare } from "lucide-react";
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

export function FilesManagerPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const { conversations, loadConversations } = useConversationStore();
  const { setConvId } = useConvId();
  const { clearMessages } = useChatStore();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      const projectFiles = await fetchProjectFiles(projectId);
      setFiles(projectFiles);
    } catch (error) {
      console.error("Error loading files:", error);
      toast.error("Failed to load files");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFile = async (
    e: React.MouseEvent,
    file: FileInfo
  ) => {
    e.stopPropagation(); // Prevent card click

    if (
      !confirm(
        `Are you sure you want to delete "${file.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    if (!projectId) return;

    try {
      await deleteFile(projectId, file.convId, file.name);
      toast.success("File deleted successfully");
      // Reload files
      loadFiles(projectId);
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
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
    <div className="flex h-screen items-center justify-center p-4">
      <div className="w-full select-none max-w-4xl space-y-6 h-full flex flex-col">

        {/* Files List */}
        {files.length > 0 ? (
          <div className="overflow-auto relative flex-1">
            <div className="p-4 space-y-3 absolute inset-0">
              {files.map((file, index) => (
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
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-4 border rounded-lg bg-background/50 backdrop-blur">
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
      </div>
    </div>
  );
}
