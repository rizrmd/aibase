import { Button } from "@/components/ui/button";
import { CreateTenantDialog } from "@/components/ui/create-tenant-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditTenantDialog } from "@/components/ui/edit-tenant-dialog";
import { TenantUsersDialog } from "@/components/ui/tenant-users-dialog";
import { TenantsList } from "@/components/ui/tenants-list";
import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import type { Tenant } from "@/stores/tenant-store";
import { useTenantStore } from "@/stores/tenant-store";
import { ArrowLeft, Building2, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";


export function TenantManagementPage() {
  const auth = useAuth();

  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const { deleteTenant } = useTenantStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [manageUsersDialogOpen, setManageUsersDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if user is root
  const isRoot = auth.user?.role === "root";

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditDialogOpen(true);
  };

  const handleDeleteTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const handleManageUsers = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setManageUsersDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedTenant || !token) return;

    setIsDeleting(true);
    const success = await deleteTenant(token, selectedTenant.id);
    setIsDeleting(false);

    if (success) {
      setDeleteDialogOpen(false);
      setSelectedTenant(null);
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

  if (!isRoot) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Only root users can manage tenants
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
              <Building2 className="size-8" />
              Tenant Management
            </h1>

            <Button className="ml-10" onClick={() => setCreateDialogOpen(true)}>
              <Plus />
              Create Tenant
            </Button>
          </div>
        </div>

        {/* Tenants List */}
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">All Tenants</h2>
            <TenantsList
              onManageUsers={handleManageUsers}
              onEditTenant={handleEditTenant}
              onDeleteTenant={handleDeleteTenant}
            />
          </div>
        </div>

        {/* Create Tenant Dialog */}
        <CreateTenantDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />

        {/* Edit Tenant Dialog */}
        <EditTenantDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          tenant={selectedTenant}
        />

        {/* Manage Users Dialog */}
        <TenantUsersDialog
          open={manageUsersDialogOpen}
          onOpenChange={setManageUsersDialogOpen}
          tenant={selectedTenant}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Tenant</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this tenant? This will also
                delete all users associated with this tenant. This action cannot
                be undone.
              </DialogDescription>
            </DialogHeader>

            {selectedTenant && (
              <div className="py-4">
                <div className="bg-muted p-4 rounded-lg">
                  <div className="font-medium">{selectedTenant.name}</div>
                  {selectedTenant.domain && (
                    <div className="text-sm text-muted-foreground">
                      Domain: {selectedTenant.domain}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground mt-1">
                    ID: {selectedTenant.id}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setSelectedTenant(null);
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
                {isDeleting ? "Deleting..." : "Delete Tenant"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
