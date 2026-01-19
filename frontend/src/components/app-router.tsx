import { Routes, Route, useLocation } from "react-router-dom";
import { MainChat } from "./pages/main-chat";
import { MemoryEditor } from "./pages/memory-editor";
import { ContextEditor } from "./pages/context-editor";
import { ConversationHistoryPage } from "./pages/conversation-history";
import { FilesManagerPage } from "./pages/files-manager";
import { ProjectSelectorPage } from "./pages/project-selector";
import { UserManagementPage } from "./pages/user-management";
import { LoginPage } from "./pages/login";
import { AdminSetupPage } from "./pages/admin-setup";
import { EmbedChatPage } from "./pages/embed-chat";
import { EmbedSettings } from "./pages/embed-settings";
import { ExtensionsSettings } from "./pages/extensions-settings";
import { ExtensionEditor } from "./pages/extension-editor";
import { ProjectRouteHandler } from "./project/project-route-handler";
import { ProtectedRoute } from "./auth/protected-route";
import { Toaster } from "./ui/sonner";
import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useConversationStore } from "@/stores/conversation-store";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";

interface AppRouterProps {
  wsUrl: string;
}

export function AppRouter({ wsUrl }: AppRouterProps) {
  const location = useLocation();

  const { currentProject } = useProjectStore();
  const { loadConversations } = useConversationStore();

  // Load conversations when project changes
  useEffect(() => {
    if (currentProject?.id) {
      loadConversations(currentProject.id);
    }
  }, [currentProject?.id, loadConversations]);

  // Check if we're on a chat-related route
  const isLoginRoute = location.pathname === "/login";
  const isEmbedRoute = location.pathname === "/embed";

  return (
    <SidebarProvider>
      {/* AppSidebar includes the sidebar-gap div that reserves space */}
      <AppSidebar />
      {/* Content area - the sidebar's gap div reserves the necessary space */}
      <div className="flex flex-1 flex-col bg-background min-h-screen">
        {/* Sidebar Trigger for mobile - Show on all pages except login and embed */}
        {!isLoginRoute && !isEmbedRoute && (
          <header className="flex items-center gap-2 border-b px-4 py-2 md:hidden">
            <SidebarTrigger />
            <span className="font-semibold">{currentProject?.name || "AI Base"}</span>
          </header>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-setup" element={<AdminSetupPage />} />
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
                    isTodoPanelVisible={true}
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
          <Route
            path="/projects/:projectId/files"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <FilesManagerPage />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/embed"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <EmbedSettings />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/extensions"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <ExtensionsSettings />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/extensions/:extensionId"
            element={
              <ProtectedRoute>
                <ProjectRouteHandler>
                  <ExtensionEditor />
                </ProjectRouteHandler>
              </ProtectedRoute>
            }
          />
          {/* Catch-all route - redirect to root */}
          <Route path="*" element={<ProtectedRoute><ProjectSelectorPage /></ProtectedRoute>} />
        </Routes>
        </main>

        {/* Toast Notifications */}
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
