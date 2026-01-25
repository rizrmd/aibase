import { Routes, Route, useLocation } from "react-router-dom";
import { ProjectRouteHandler } from "./project/project-route-handler";
import { ProtectedRoute } from "./auth/protected-route";
import { AdminRoute } from "./auth/admin-route";
import { Toaster } from "./ui/sonner";
import { SetupRequired } from "./setup-required";
import { useEffect, Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { getAppName, isWhatsAppEnabled } from "@/lib/setup";
import * as React from "react";
import { useProjectStore } from "@/stores/project-store";
import { useConversationStore } from "@/stores/conversation-store";
import { useAuthStore } from "@/stores/auth-store";
import { AppSidebar } from "./app-sidebar";
import { UserAccountMenu } from "./user-account-menu";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "./ui/sidebar";

// Lazy load page components
const MainChat = lazy(() => import("./pages/main-chat").then(module => ({ default: module.MainChat })));
const MemoryEditor = lazy(() => import("./pages/memory-editor").then(module => ({ default: module.MemoryEditor })));
const ContextEditor = lazy(() => import("./pages/context-editor").then(module => ({ default: module.ContextEditor })));
const ConversationHistoryPage = lazy(() => import("./pages/conversation-history").then(module => ({ default: module.ConversationHistoryPage })));
const FilesManagerPage = lazy(() => import("./pages/files-manager").then(module => ({ default: module.FilesManagerPage })));
const ProjectSelectorPage = lazy(() => import("./pages/project-selector").then(module => ({ default: module.ProjectSelectorPage })));
const UserManagementPage = lazy(() => import("./pages/user-management").then(module => ({ default: module.UserManagementPage })));
const LoginPage = lazy(() => import("./pages/login").then(module => ({ default: module.LoginPage })));
const AdminSetupPage = lazy(() => import("./pages/admin-setup").then(module => ({ default: module.AdminSetupPage })));
const EmbedChatPage = lazy(() => import("./pages/embed-chat").then(module => ({ default: module.EmbedChatPage })));
const EmbedSettings = lazy(() => import("./pages/embed-settings").then(module => ({ default: module.EmbedSettings })));
const ExtensionsSettings = lazy(() => import("./pages/extensions-settings").then(module => ({ default: module.ExtensionsSettings })));
const ExtensionEditor = lazy(() => import("./pages/extension-editor").then(module => ({ default: module.ExtensionEditor })));
const ExtensionAICreator = lazy(() => import("./pages/extension-ai-creator").then(module => ({ default: module.ExtensionAICreator })));
const WhatsAppSettings = lazy(() => import("./pages/whatsapp-settings").then(module => ({ default: module.WhatsAppSettings })));
const DeveloperAPIPage = lazy(() => import("./pages/developer-api").then(module => ({ default: module.DeveloperAPIPage })));
const ProfilePage = lazy(() => import("./pages/profile").then(module => ({ default: module.ProfilePage })));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8 w-full h-full min-h-[50vh]">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

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

  // Show sidebar on all authenticated pages except login, embed, root, and admin-setup
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
      <SidebarInset className="flex flex-col">
        {/* Top header bar with user account - Show only when NOT inside a project */}
        {shouldShowTopAccountMenu && (
          <header className="flex items-center justify-end border-b px-4 py-2 bg-background">
            <UserAccountMenu
              user={{
                username: user.username,
                email: user.email,
              }}
              onLogout={logout}
            />
          </header>
        )}
        {/* Sidebar Trigger for mobile - Show only when sidebar is visible */}
        {shouldShowSidebar && (
          <header className="flex z-20 bg-background/80 backdrop-blur-sm sticky top-0 left-0 right-0 items-center gap-2 border-b px-4 py-2 md:hidden h-[60px]">
            <SidebarTrigger />
            <span className="font-semibold truncate">{currentProject?.name || appName}</span>
          </header>
        )}

        {/* Content Area */}
        <div className="main-content flex flex-col flex-1">
          {shouldShowSetupRequired ? (
            <SetupRequired />
          ) : (
            <Suspense fallback={<LoadingFallback />}>
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
                    <AdminRoute>
                      <UserManagementPage />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
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
                      <AdminRoute>
                        <ProjectRouteHandler>
                          <WhatsAppSettings />
                        </ProjectRouteHandler>
                      </AdminRoute>
                    }
                  />
                )}
                <Route
                  path="/projects/:projectId/api"
                  element={
                    <AdminRoute>
                      <ProjectRouteHandler>
                        <DeveloperAPIPage />
                      </ProjectRouteHandler>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/embed"
                  element={
                    <AdminRoute>
                      <ProjectRouteHandler>
                        <EmbedSettings />
                      </ProjectRouteHandler>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/extensions"
                  element={
                    <AdminRoute>
                      <ProjectRouteHandler>
                        <ExtensionsSettings />
                      </ProjectRouteHandler>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/extensions/:extensionId"
                  element={
                    <AdminRoute>
                      <ProjectRouteHandler>
                        <ExtensionEditor />
                      </ProjectRouteHandler>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/projects/:projectId/extensions/ai-create"
                  element={
                    <ProtectedRoute>
                      <ProjectRouteHandler>
                        <ExtensionAICreator />
                      </ProjectRouteHandler>
                    </ProtectedRoute>
                  }
                />
                {/* Catch-all route - redirect to root */}
                <Route path="*" element={<ProtectedRoute><ProjectSelectorPage /></ProtectedRoute>} />
              </Routes>
            </Suspense>
          )}
        </div>

        {/* Toast Notifications */}
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
