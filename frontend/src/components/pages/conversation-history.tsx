"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PageActionButton,
  PageActionGroup,
} from "@/components/ui/page-action-button";
import { Button } from "@/components/ui/button";
import { useConvId } from "@/lib/conv-id";
import { formatRelativeTime } from "@/lib/time-utils";
import { useChatStore } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useProjectStore } from "@/stores/project-store";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  fetchConversationFiles,
  formatFileSize,
  getFileIcon,
  type FileInfo,
} from "@/lib/files-api";
import { regenerateConversationTitle } from "@/lib/conversation-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";

export function ConversationHistoryPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { conversations, isLoading, loadConversations, removeConversation } =
    useConversationStore();
  const { currentProject } = useProjectStore();
  const { clearMessages } = useChatStore();
  const { setConvId, clearConvId } = useConvId();
  const [deletingConversation, setDeletingConversation] = useState<{
    convId: string;
    title: string;
    files: FileInfo[];
  } | null>(null);
  const [regeneratingTitleId, setRegeneratingTitleId] = useState<string | null>(null);

  useEffect(() => {
    // Load conversations when component mounts
    if (projectId) {
      loadConversations(projectId);
    }
  }, [projectId, loadConversations]);

  const handleSelectConversation = async (convId: string) => {
    if (!projectId) return;

    // Set the conversation ID
    setConvId(convId);

    // Clear current messages (will be loaded by main-chat)
    clearMessages();

    // Navigate to chat page with the selected conversation
    navigate(`/projects/${projectId}/chat`);
  };

  const handleNewConversation = () => {
    if (!projectId) return;

    // Clear conversation ID to start fresh
    clearConvId();

    // Clear current messages
    clearMessages();

    // Navigate to chat page for new conversation
    navigate(`/projects/${projectId}/chat`);
  };

  const handleDeleteConversation = async (
    e: React.MouseEvent,
    convId: string,
    title: string
  ) => {
    e.stopPropagation(); // Prevent card click

    if (!projectId) return;

    // Load files for this conversation
    try {
      const files = await fetchConversationFiles(convId, projectId);
      setDeletingConversation({ convId, title, files });
    } catch (error) {
      console.error("Error loading files:", error);
      // Still allow deletion even if files can't be loaded
      setDeletingConversation({ convId, title, files: [] });
    }
  };

  const confirmDelete = async () => {
    if (!deletingConversation || !projectId) return;

    const success = await removeConversation(deletingConversation.convId, projectId);
    if (success) {
      toast.success("Conversation deleted successfully");
      setDeletingConversation(null);
    }
  };

  const handleRegenerateTitle = async (
    e: React.MouseEvent,
    convId: string,
    _currentTitle: string
  ) => {
    e.stopPropagation(); // Prevent card click

    if (!projectId) return;

    setRegeneratingTitleId(convId);

    try {
      await regenerateConversationTitle(convId, projectId);
      toast.success("Title regenerated successfully");

      // Reload conversations to get the updated title
      await loadConversations(projectId);
    } catch (error) {
      console.error("Error regenerating title:", error);
      toast.error(error instanceof Error ? error.message : "Failed to regenerate title");
    } finally {
      setRegeneratingTitleId(null);
    }
  };

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-medium">Loading conversations...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center p-4">
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingConversation} onOpenChange={(open) => !open && setDeletingConversation(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription className="space-y-3 text-left">
              <p>
                Are you sure you want to delete "{deletingConversation?.title}"?
              </p>
              <p className="text-sm">
                This will permanently delete all messages
                {deletingConversation?.files && deletingConversation.files.length > 0 && (
                  <> and {deletingConversation.files.length} {deletingConversation.files.length === 1 ? "file" : "files"}</>
                )}.
              </p>
              {deletingConversation?.files && deletingConversation.files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">Files to be deleted:</p>
                  <div className="max-h-40 overflow-auto space-y-1 border rounded-md p-2 bg-muted/30">
                    {deletingConversation.files.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <span className="text-lg">{getFileIcon(file.name)}</span>
                        <span className="flex-1 truncate text-foreground">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingConversation(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Conversation Button - Absolute positioned top right */}
      <PageActionGroup>
        <PageActionButton
          icon={Plus}
          label="New"
          onClick={handleNewConversation}
          variant="outline"
          size="sm"
          title="Start a new conversation"
        />
      </PageActionGroup>

      <div className="w-full select-none max-w-3xl space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="text-center space-y-2 pt-16 sm:pt-6">
          <p className=" text-lg">
            {currentProject?.name || "Select a conversation to continue"}
          </p>
        </div>

        {/* Conversations List */}
        {conversations.length > 0 ? (
          <div className="overflow-auto relative flex-1">
            <div className="p-4 space-y-3 absolute inset-0">
              {conversations.map((conversation) => (
                <Card
                  key={conversation.convId}
                  className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.01] group pt-3 pb-1"
                  onClick={() => handleSelectConversation(conversation.convId)}
                >
                  <CardHeader className="min-h-0 h-auto">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                          <MessageSquare className="size-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg line-clamp-2 break-words">
                            {conversation.title}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <span>
                              {formatRelativeTime(conversation.lastUpdatedAt)}
                            </span>
                            <span>•</span>
                            <span>{conversation.messageCount} messages</span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) =>
                            handleRegenerateTitle(
                              e,
                              conversation.convId,
                              conversation.title
                            )
                          }
                          disabled={regeneratingTitleId === conversation.convId}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          title="Regenerate title"
                        >
                          <RefreshCw className={`size-4 text-muted-foreground ${regeneratingTitleId === conversation.convId ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) =>
                            handleDeleteConversation(
                              e,
                              conversation.convId,
                              conversation.title
                            )
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          title="Delete conversation"
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
              <MessageSquare className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium">No conversations yet</p>
              <p className="text-muted-foreground">
                Start a new conversation to see it here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
