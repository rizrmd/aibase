"use client"

import * as React from "react"
import {
  Command,
  MessageSquare,
  History,
  Database,
  FolderOpen,
  Files,
  Terminal,
  Puzzle,
  Users,
  MessageCircle,
} from "lucide-react"
import { Link } from "react-router-dom"

import { getAppName, getLogoUrl, isWhatsAppEnabled } from "@/lib/setup"
import { NavSection } from "@/components/nav-section"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useProjectStore } from "@/stores/project-store"
import { useAuthStore } from "@/stores/auth-store"
import { UserAccountMenu } from "@/components/user-account-menu"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { currentProject } = useProjectStore()
  const currentUser = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const isAdmin = currentUser?.role === "admin"
  const [appName, setAppName] = React.useState<string>("")
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [aimeowEnabled, setAimeowEnabled] = React.useState<boolean>(false)

  const { isMobile, setOpenMobile } = useSidebar()

  React.useEffect(() => {
    const loadConfig = async () => {
      const [name, logo, whatsappEnabled] = await Promise.all([
        getAppName(),
        getLogoUrl(),
        isWhatsAppEnabled()
      ])
      setAppName(name)
      setLogoUrl(logo)
      setAimeowEnabled(whatsappEnabled)
    }
    loadConfig()
  }, [])

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // Generate the URL for the current project
  const getUrl = (path: string) => {
    if (!currentProject?.id) return "#"
    return `/projects/${currentProject.id}/${path}`
  }

  const primaryActions = [
    {
      title: "Chat",
      url: getUrl("chat"),
      icon: MessageSquare,
      isActive: true,
    },
    {
      title: "History",
      url: getUrl("history"),
      icon: History,
    },
  ]

  const workspace = [
    {
      title: "Context",
      url: getUrl("context"),
      icon: FolderOpen,
    },
    {
      title: "Files",
      url: getUrl("files"),
      icon: Files,
    },
    {
      title: "Memory",
      url: getUrl("memory"),
      icon: Database,
    },
  ]

  const developer = [
    ...(aimeowEnabled ? [{
      title: "WhatsApp",
      url: getUrl("whatsapp"),
      icon: MessageCircle,
    }] : []),
    {
      title: "API",
      url: getUrl("api"),
      icon: Terminal,
    },
    {
      title: "Embed",
      url: getUrl("embed"),
      icon: Terminal,
    },
    {
      title: "Extensions",
      url: getUrl("extensions"),
      icon: Puzzle,
    },
    ...(isAdmin ? [{
      title: "Users",
      url: "/admin/users",
      icon: Users,
    }] : []),
  ]

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="h-[60px]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              {appName && <Link to="/" onClick={handleLinkClick}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt={appName} className="size-full object-cover" />
                  ) : (
                    <Command className="size-4" />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{appName}</span>
                  <span className="truncate text-xs">{currentProject?.name || "Select Project"}</span>
                </div>
              </Link>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Primary actions - no label */}
        <NavSection items={primaryActions} />
        {/* Workspace - project data/content */}
        <NavSection title="Workspace" items={workspace} />
        {/* Developer - integration/dev tools */}
        <NavSection title="Developer" items={developer} />
      </SidebarContent>
      {/* User account menu at bottom of sidebar */}
      {currentUser && (
        <SidebarFooter>
          <UserAccountMenu
            user={{
              username: currentUser.username,
              email: currentUser.email,
            }}
            onLogout={logout}
            showInline={true}
          />
        </SidebarFooter>
      )}
    </Sidebar>
  )
}
