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
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

export function ConversationHistoryPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { conversations, isLoading, loadConversations, removeConversation } =
    useConversationStore();
  const { currentProject } = useProjectStore();
  const { clearMessages } = useChatStore();
  const { setConvId, clearConvId } = useConvId();

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

    if (
      !confirm(
        `Are you sure you want to delete "${title}"? This will permanently delete all messages and files.`
      )
    ) {
      return;
    }

    if (!projectId) return;

    const success = await removeConversation(convId, projectId);
    if (success) {
      toast.success("Conversation deleted successfully");
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
        <div className="text-center space-y-2">
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
