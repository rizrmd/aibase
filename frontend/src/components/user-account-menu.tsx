import { LogOut, UserMinus } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

// Helper function to generate initials from username
function getInitials(username: string): string {
  if (!username) return "U"
  const words = username.trim().split(/\s+/)
  if (words.length === 1) {
    return username.substring(0, 2).toUpperCase()
  }
  return words
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase()
}

export function UserAccountMenu({
  user,
  onLogout,
  showInline = false,
}: {
  user: {
    username: string
    email: string
  }
  onLogout?: () => void
  /**
   * If true, shows username and email inline with the avatar (for sidebar footer)
   * If false, shows only avatar button with dropdown (for top header)
   */
  showInline?: boolean
}) {
  const initials = getInitials(user.username)
  const adminToken = useAuthStore((state) => state.adminToken);
  const stopImpersonating = useAuthStore((state) => state.stopImpersonating);

  // Inline variant for sidebar footer - shows avatar + text with dropdown menu
  if (showInline) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-2 w-full cursor-pointer hover:bg-accent rounded-lg transition-colors p-1 -mx-1">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src="" alt={user.username} />
              <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col overflow-hidden text-left">
              <span className="truncate text-sm font-medium">{user.username}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 rounded-lg"
          align="end"
          sideOffset={4}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src="" alt={user.username} />
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.username}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {adminToken && (
            <DropdownMenuItem onClick={stopImpersonating}>
              <UserMinus className="mr-2 h-4 w-4" />
              Stop Impersonating
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Default variant for top header - avatar button with dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative cursor-pointer h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src="" alt={user.username} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 rounded-lg"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src="" alt={user.username} />
              <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.username}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {adminToken && (
          <DropdownMenuItem onClick={stopImpersonating}>
            <UserMinus className="mr-2 h-4 w-4" />
            Stop Impersonating
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
