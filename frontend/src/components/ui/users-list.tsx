import { useEffect } from "react";
import { useAuthStore, type User } from "@/stores/auth-store";
import { useAdminStore } from "@/stores/admin-store";
import { Badge } from "./badge";
import { Button } from "./button";
import { Trash2, Shield, Crown, User as UserIcon, UserCog } from "lucide-react";

interface UsersListProps {
  onDeleteUser?: (user: User) => void;
  onImpersonateUser?: (user: User) => void;
}

export function UsersList({ onDeleteUser, onImpersonateUser }: UsersListProps) {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const { users, isLoading, error, fetchUsers } = useAdminStore();

  useEffect(() => {
    if (token) {
      fetchUsers(token);
    }
  }, [token]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "root":
        return <Crown className="size-3" />;
      case "admin":
        return <Shield className="size-3" />;
      default:
        return <UserIcon className="size-3" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "root":
        return "destructive" as const;
      case "admin":
        return "default" as const;
      default:
        return "secondary" as const;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">No users found</div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {user.username}
                        {currentUser?.id === user.id && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (You)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    {user.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={getRoleBadgeVariant(user.role)}
                    className="gap-1"
                  >
                    {getRoleIcon(user.role)}
                    {user.role}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    {formatDate(user.created_at)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {currentUser?.id !== user.id && onImpersonateUser && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onImpersonateUser(user)}
                        title="Impersonate user"
                      >
                        <UserCog className="size-4" />
                      </Button>
                    )}
                    {currentUser?.id !== user.id && onDeleteUser && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDeleteUser(user)}
                        title="Delete user"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
