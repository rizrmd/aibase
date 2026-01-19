"use client"

import * as React from "react"
import {
  Command,
  MessageSquare,
  History,
  Database,
  FileText,
  Code,
  LifeBuoy,
  Send,
  Users,
} from "lucide-react"

import { NavSection } from "@/components/nav-section"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useProjectStore } from "@/stores/project-store"
import { useAuthStore } from "@/stores/auth-store"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { currentProject } = useProjectStore()
  const currentUser = useAuthStore((state) => state.user)
  const isAdmin = currentUser?.role === "admin"

  // Generate the URL for the current project
  const getUrl = (path: string) => {
    if (!currentProject?.id) return "#"
    return `/projects/${currentProject.id}/${path}`
  }

  const data = {
    user: {
      name: (currentUser as any)?.name || "User",
      email: currentUser?.email || "",
      avatar: (currentUser as any)?.avatar || "/avatars/default.jpg",
    },
    // Primary actions (no label)
    primaryActions: [
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
    ],
    // Workspace section - project data/content
    workspace: [
      {
        title: "Context",
        url: getUrl("context"),
        icon: FileText,
      },
      {
        title: "Files",
        url: getUrl("files"),
        icon: FileText,
      },
      {
        title: "Memory",
        url: getUrl("memory"),
        icon: Database,
      },
    ],
    // Developer section - integration/dev tools
    developer: [
      {
        title: "Embed",
        url: getUrl("embed"),
        icon: Code,
      },
      {
        title: "Extensions",
        url: getUrl("extensions"),
        icon: Code,
      },
      ...(isAdmin ? [{
        title: "Admin",
        url: "/admin/users",
        icon: Users,
      }] : []),
    ],
    navSecondary: [
      {
        title: "Support",
        url: "https://github.com/rizrmd/aibase/issues",
        icon: LifeBuoy,
      },
      {
        title: "Feedback",
        url: "https://github.com/rizrmd/aibase/issues",
        icon: Send,
      },
    ],
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">AI Base</span>
                  <span className="truncate text-xs">{currentProject?.name || "Select Project"}</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Primary actions - no label */}
        <NavSection items={data.primaryActions} />
        {/* Workspace - project data/content */}
        <NavSection title="Workspace" items={data.workspace} />
        {/* Developer - integration/dev tools */}
        <NavSection title="Developer" items={data.developer} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
