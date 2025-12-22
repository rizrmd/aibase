import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { MainChat } from "./pages/main-chat";
import { MemoryEditor } from "./pages/memory-editor";
import { ContextEditor } from "./pages/context-editor";
import { ConversationHistoryPage } from "./pages/conversation-history";
import { ProjectSelectorPage } from "./pages/project-selector";
import { UserManagementPage } from "./pages/user-management";
import { TenantManagementPage } from "./pages/tenant-management";
import { LoginPage } from "./pages/login";
import { EmbedChatPage } from "./pages/embed-chat";
import { ProjectRouteHandler } from "./project/project-route-handler";
import { ProtectedRoute } from "./auth/protected-route";
import { Button } from "./ui/button";
import { UserMenu } from "./ui/user-menu";
import { EmbedButton } from "./ui/embed-button";
import {
  MessageSquare,
  Binary,
  ListTodo,
  FileText,
  ArrowLeft,
  MessagesSquare,
  Users,
  Building2,
} from "lucide-react";
import { Toaster } from "./ui/sonner";
import { useState, useEffect } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useProjectStore } from "@/stores/project-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";
import { useShallow } from "zustand/react/shallow";

interface AppRouterProps {
  wsUrl: string;
}

export function AppRouter({ wsUrl }: AppRouterProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isTodoPanelVisible, setIsTodoPanelVisible] = useState(true);

  const { todos } = useChatStore(
    useShallow((state) => ({
      todos: state.todos,
    }))
  );

  const { currentProject } = useProjectStore();
  const { conversations, loadConversations } = useConversationStore();
  const currentUser = useAuthStore((state) => state.user);

  // Check user roles
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "root";
  const isRoot = currentUser?.role === "root";

  // Load conversations when project changes
  useEffect(() => {
    if (currentProject?.id) {
      loadConversations(currentProject.id);
    }
  }, [currentProject?.id, loadConversations]);

  // Check if we're on a chat-related route
  const isChatRoute = location.pathname.startsWith("/projects/");
  const isLoginRoute = location.pathname === "/login";
  const isEmbedRoute = location.pathname === "/embed";

  return (
    <div className="flex h-screen flex-col">
      {/* Navigation Bar - Only show on chat routes */}
      {isChatRoute && currentProject && (
        <div className="absolute top-0 left-0 m-3 z-10 flex gap-2">
          {/* Back to Projects Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            title="Back to Projects"
          >
            <ArrowLeft />
          </Button>

          {/* Navigation Buttons */}
          <Button
            variant={
              location.pathname === `/projects/${currentProject.id}/chat`
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() => navigate(`/projects/${currentProject.id}/chat`)}
          >
            <MessageSquare />
            {location.pathname === `/projects/${currentProject.id}/chat` && (
              <>Chat</>
            )}
          </Button>
          {conversations.length > 0 && (
            <Button
              variant={
                location.pathname === `/projects/${currentProject.id}/history`
                  ? "default"
                  : "ghost"
              }
              size="sm"
              onClick={() => navigate(`/projects/${currentProject.id}/history`)}
              title="Conversation History"
            >
              <MessagesSquare />
              {location.pathname ===
                `/projects/${currentProject.id}/history` && <>History</>}
            </Button>
          )}
          <Button
            variant={
              location.pathname === `/projects/${currentProject.id}/memory`
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() => navigate(`/projects/${currentProject.id}/memory`)}
          >
            <Binary />
            {location.pathname === `/projects/${currentProject.id}/memory` && (
              <>Memory</>
            )}
          </Button>
          <Button
            variant={
              location.pathname === `/projects/${currentProject.id}/context`
                ? "default"
                : "ghost"
            }
            size="sm"
            onClick={() => navigate(`/projects/${currentProject.id}/context`)}
          >
            <FileText />
            {location.pathname === `/projects/${currentProject.id}/context` && (
              <>Context</>
            )}
          </Button>
          <EmbedButton projectId={currentProject.id} />
          {location.pathname === `/projects/${currentProject.id}/chat` &&
            todos?.items?.length > 0 && (
              <Button
                variant={isTodoPanelVisible ? "outline" : "ghost"}
                size="sm"
                onClick={() => setIsTodoPanelVisible(!isTodoPanelVisible)}
                title={isTodoPanelVisible ? "Hide tasks" : "Show tasks"}
              >
                <ListTodo />
                {isTodoPanelVisible && <>Tasks</>}
              </Button>
            )}
        </div>
      )}

      {/* Top Right Navigation - Show on all pages except login and embed */}
      {!isLoginRoute && !isEmbedRoute && (
        <div className="absolute top-0 right-0 m-3 z-10 flex gap-2">
          {/* Tenants button (root only, not on chat routes) */}
          {isRoot && !isChatRoute && (
            <Button
              variant={
                location.pathname === "/admin/tenants" ? "default" : "ghost"
              }
              size="sm"
              onClick={() => navigate("/admin/tenants")}
            >
              <Building2 />
              {location.pathname === "/admin/tenants" && <>Tenants</>}
            </Button>
          )}
          {/* Users button (admin and root, not on chat routes) */}
          {isAdmin && !isChatRoute && (
            <Button
              variant={
                location.pathname === "/admin/users" ? "default" : "ghost"
              }
              size="sm"
              onClick={() => navigate("/admin/users")}
            >
              <Users />
              {location.pathname === "/admin/users" && <>Users</>}
            </Button>
          )}
          {!isChatRoute && <UserMenu />}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/embed" element={<EmbedChatPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ProjectSelectorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tenants"
            element={
              <ProtectedRoute>
                <TenantManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <UserManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/chat"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <MainChat
                    wsUrl={wsUrl}
                    isTodoPanelVisible={isTodoPanelVisible}
                  />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/history"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <ConversationHistoryPage />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/memory"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <MemoryEditor />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/context"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <ContextEditor />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}
