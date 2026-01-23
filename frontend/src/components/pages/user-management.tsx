import { Button } from "@/components/ui/button";
import { CreateUserDialog } from "@/components/ui/create-user-dialog";
import { UsersList } from "@/components/ui/users-list";
import { useAuth } from "@/hooks/use-auth";
import { useAdminStore } from "@/stores/admin-store";
import { useAuthStore } from "@/stores/auth-store";
import { Users, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageActionButton,
  PageActionGroup,
} from "@/components/ui/page-action-button";
import type { User } from "@/stores/auth-store";

export function UserManagementPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const { deleteUser, impersonateUser } = useAdminStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if user has admin permissions
  const isAdmin = auth.user?.role === "admin";

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete || !token) return;

    setIsDeleting(true);
    const success = await deleteUser(token, userToDelete.id);
    setIsDeleting(false);

    if (success) {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleImpersonateUser = async (user: User) => {
    if (!token) return;

    const result = await impersonateUser(token, user.id);
    if (result) {
      const { user: impersonatedUser, token: newToken } = result;
      // Save original admin session before switching
      const authStore = useAuthStore.getState();
      const currentAdminUser = authStore.user;
      const currentAdminToken = authStore.token;

      authStore.setToken(newToken);
      authStore.setUser(impersonatedUser);

      // Update store with admin session if not already impersonating
      if (!authStore.adminToken) {
        useAuthStore.setState({
          adminUser: currentAdminUser,
          adminToken: currentAdminToken
        });
      }

      navigate("/");
    }
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">
            Please login to access this page
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have permission to access this page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen items-center px-4 pt-[60px] md:px-6 pb-4">
      {/* Action Buttons - Absolute positioned top right */}
      <PageActionGroup isFixedOnMobile={true}>
        <PageActionButton
          icon={UserPlus}
          label="Create User"
          onClick={() => setCreateDialogOpen(true)}
          variant="default"
          size="sm"
          title="Create a new user"
        />
      </PageActionGroup>

      <div className="w-full select-none max-w-3xl space-y-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Users className="size-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            User Management
          </h1>
        </div>

        {/* Users List */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <UsersList
            onDeleteUser={handleDeleteUser}
            onImpersonateUser={handleImpersonateUser}
          />
        </div>

        {/* Create User Dialog */}
        <CreateUserDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this user? This action cannot be
                undone.
              </DialogDescription>
            </DialogHeader>

            {userToDelete && (
              <div className="py-4">
                <div className="bg-muted p-4 rounded-lg">
                  <div className="font-medium">{userToDelete.username}</div>
                  <div className="text-sm text-muted-foreground">
                    {userToDelete.email}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Role: {userToDelete.role}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setUserToDelete(null);
                }}
                className="flex-1"
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                className="flex-1"
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
