import { Button } from "@/components/ui/button";
import { CreateUserDialog } from "@/components/ui/create-user-dialog";
import { UsersList } from "@/components/ui/users-list";
import { useAuth } from "@/hooks/use-auth";
import { useAdminStore } from "@/stores/admin-store";
import { useAuthStore } from "@/stores/auth-store";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { User } from "@/stores/auth-store";

export function UserManagementPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const { deleteUser } = useAdminStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if user has admin permissions
  const isAdmin = auth.user?.role === "admin" || auth.user?.role === "root";

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
    <div className="h-screen overflow-auto bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="mr-4 "
              onClick={() => navigate("/")}
              title="Back to Projects"
            >
              <ArrowLeft />
            </Button>

            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Users className="size-8" />
              User Management
            </h1>

            <Button className="ml-10" onClick={() => setCreateDialogOpen(true)}>
              <UserPlus />
              Create User
            </Button>
          </div>
        </div>

        {/* Users List */}
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">All Users</h2>
            <UsersList onDeleteUser={handleDeleteUser} />
          </div>
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
