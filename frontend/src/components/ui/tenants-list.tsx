import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useTenantStore, type Tenant } from "@/stores/tenant-store";
import { Button } from "./button";
import { Trash2, Building2, Globe, Edit, Users } from "lucide-react";
import { buildApiUrl } from "@/lib/base-path";

const API_BASE_URL = buildApiUrl("");

interface TenantsListProps {
  onEditTenant?: (tenant: Tenant) => void;
  onDeleteTenant?: (tenant: Tenant) => void;
  onManageUsers?: (tenant: Tenant) => void;
}

export function TenantsList({ onEditTenant, onDeleteTenant, onManageUsers }: TenantsListProps) {
  const token = useAuthStore((state) => state.token);
  const { tenants, isLoading, error, fetchTenants } = useTenantStore();

  useEffect(() => {
    if (token) {
      fetchTenants(token);
    }
  }, [token]);

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
        <div className="text-sm text-muted-foreground">Loading tenants...</div>
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

  if (tenants.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Building2 className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No tenants found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create your first tenant to get started
          </p>
        </div>
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
                Tenant
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Domain
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
            {tenants.map((tenant) => (
              <tr
                key={tenant.id}
                className="hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {tenant.has_logo ? (
                      <img
                        src={`${API_BASE_URL}/api/tenants/${tenant.id}/logo`}
                        alt={`${tenant.name} logo`}
                        className="size-10 rounded-lg border object-cover"
                      />
                    ) : (
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="size-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {tenant.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ID: {tenant.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {tenant.domain ? (
                    <div className="flex items-center gap-2">
                      <Globe className="size-4 text-muted-foreground" />
                      <span className="text-sm">{tenant.domain}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No domain
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    {formatDate(tenant.created_at)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    {onManageUsers && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onManageUsers(tenant)}
                        title="Manage users"
                      >
                        <Users className="size-4" />
                      </Button>
                    )}
                    {onEditTenant && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEditTenant(tenant)}
                        title="Edit tenant"
                      >
                        <Edit className="size-4" />
                      </Button>
                    )}
                    {onDeleteTenant && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onDeleteTenant(tenant)}
                        title="Delete tenant"
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
