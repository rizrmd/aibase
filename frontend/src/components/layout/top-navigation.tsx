import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/ui/user-menu";
import { Users } from "lucide-react";

interface TopNavigationProps {
  isAdmin: boolean;
}

export function TopNavigation({ isAdmin }: TopNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isChatRoute = location.pathname.startsWith("/projects/");

  return (
    <div className="absolute top-0 right-0 m-3 z-10 flex gap-2">
      {/* Users button (admin only, not on chat routes) */}
      {isAdmin && !isChatRoute && (
        <Button
          variant={location.pathname === "/admin/users" ? "default" : "ghost"}
          size="sm"
          onClick={() => navigate("/admin/users")}
        >
          <Users />
          {location.pathname === "/admin/users" && (
            <span className="hidden sm:inline">Users</span>
          )}
        </Button>
      )}
      {!isChatRoute && <UserMenu />}
    </div>
  );
}
