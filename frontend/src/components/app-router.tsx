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
import { WhatsAppSettings } from "./pages/whatsapp-settings";
import { ProjectRouteHandler } from "./project/project-route-handler";
import { ProtectedRoute } from "./auth/protected-route";
import { Toaster } from "./ui/sonner";
import { SetupRequired } from "./setup-required";
import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";
import { AppSidebar } from "./app-sidebar";
import { UserAccountMenu } from "./user-account-menu";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { getAppName, isWhatsAppEnabled } from "@/lib/setup";
import * as React from "react";

interface AppRouterProps {
  wsUrl: string;
}

export function AppRouter({ wsUrl }: AppRouterProps) {
  const location = useLocation();
  const [appName, setAppName] = React.useState<string>("AI Base");
  const [aimeowEnabled, setAimeowEnabled] = React.useState<boolean>(false);

  const { currentProject } = useProjectStore();
  const { loadConversations } = useConversationStore();
  const { user, logout, needsSetup, checkSetup, setupChecked } = useAuthStore();

  // Check setup status, load app name and settings on mount
  useEffect(() => {
    if (!setupChecked) {
      checkSetup();
    }

    const loadConfig = async () => {
      const [name, whatsappEnabled] = await Promise.all([
        getAppName(),
        isWhatsAppEnabled()
      ]);
      setAppName(name);
      setAimeowEnabled(whatsappEnabled);
    };
    loadConfig();
  }, [checkSetup, setupChecked]);

  // Load conversations when project changes
  useEffect(() => {
    if (currentProject?.id) {
      loadConversations(currentProject.id);
    }
  }, [currentProject?.id, loadConversations]);

  // Check if we're on routes that should NOT have sidebar
  const isLoginRoute = location.pathname === "/login";
  const isEmbedRoute = location.pathname === "/embed";
  const isRootRoute = location.pathname === "/";
  const isAdminSetupRoute = location.pathname === "/admin-setup";

  // Show sidebar only when inside a project or on admin pages
  const shouldShowSidebar = !isLoginRoute && !isEmbedRoute && !isRootRoute && !isAdminSetupRoute;

  // Show top header account menu only when NOT inside a project (root/home or admin pages)
  const shouldShowTopAccountMenu = !isLoginRoute && user && !shouldShowSidebar;

  // Show setup required page when no tenants exist
  const shouldShowSetupRequired = needsSetup && !isAdminSetupRoute;

  return (
    <SidebarProvider>
      {/* AppSidebar includes the sidebar-gap div that reserves space */}
      {/* Only show sidebar when inside a project */}
      {shouldShowSidebar && <AppSidebar />}
      {/* Content area - the sidebar's gap div reserves the necessary space */}
      <div className="flex flex-1 flex-col bg-background min-h-screen">
        {/* Top header bar with user account - Show only when NOT inside a project */}
        {shouldShowTopAccountMenu && (
          <div className="absolute cursor-pointer top-5 right-5">
            <UserAccountMenu
              user={{
                username: user.username,
                email: user.email,
              }}
              onLogout={logout}
            />
          </div>
        )}
        {/* Sidebar Trigger for mobile - Show only when sidebar is visible */}
        {shouldShowSidebar && (
          <header className="flex z-1 bg-white absolute top-0 left-0 right-0 items-center gap-2 border-b px-4 py-2 md:hidden">
            <SidebarTrigger />
            <span className="font-semibold">{currentProject?.name || appName}</span>
          </header>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-hidden">
          {shouldShowSetupRequired ? (
            <SetupRequired />
          ) : (
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
              {aimeowEnabled && (
                <Route
                  path="/projects/:projectId/whatsapp"
                  element={
                    <ProtectedRoute>
                      <ProjectRouteHandler>
                        <WhatsAppSettings />
                      </ProjectRouteHandler>
                    </ProtectedRoute>
                  }
                />
              )}
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
          )}
        </main>

        {/* Toast Notifications */}
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
