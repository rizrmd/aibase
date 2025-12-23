import { create } from "zustand";
import { buildApiUrl } from "@/lib/base-path";

const API_BASE_URL = buildApiUrl("");

export interface Tenant {
  id: number;
  name: string;
  domain: string | null;
  has_logo: boolean;
  created_at: number;
  updated_at: number;
}

interface TenantStore {
  // State
  tenants: Tenant[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setTenants: (tenants: Tenant[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  fetchTenants: (token: string) => Promise<void>;
  createTenant: (
    token: string,
    name: string,
    domain: string | null
  ) => Promise<Tenant | null>;
  updateTenant: (
    token: string,
    tenantId: number,
    name: string,
    domain: string | null
  ) => Promise<boolean>;
  deleteTenant: (token: string, tenantId: number) => Promise<boolean>;
  uploadLogo: (token: string, tenantId: number, file: File) => Promise<boolean>;
  deleteLogo: (token: string, tenantId: number) => Promise<boolean>;
}

export const useTenantStore = create<TenantStore>((set, _get) => ({
  // Initial state
  tenants: [],
  isLoading: false,
  error: null,

  // Synchronous actions
  setTenants: (tenants) => set({ tenants }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  // Async actions
  fetchTenants: async (token: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_BASE_URL}/api/tenants`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch tenants");
      }

      const data = await response.json();
      set({ tenants: data.tenants, isLoading: false, error: null });
    } catch (error: any) {
      console.error("[Tenant] Fetch tenants error:", error);
      set({
        error: error.message || "Failed to fetch tenants",
        isLoading: false,
      });
    }
  },

  createTenant: async (
    token: string,
    name: string,
    domain: string | null
  ): Promise<Tenant | null> => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_BASE_URL}/api/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, domain }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create tenant");
      }

      const data = await response.json();

      // Add the new tenant to the list
      set((state) => ({
        tenants: [...state.tenants, data.tenant],
        isLoading: false,
        error: null,
      }));

      console.log("[Tenant] Tenant created successfully:", data.tenant.name);
      return data.tenant;
    } catch (error: any) {
      console.error("[Tenant] Create tenant error:", error);
      set({
        error: error.message || "Failed to create tenant",
        isLoading: false,
      });
      return null;
    }
  },

  updateTenant: async (
    token: string,
    tenantId: number,
    name: string,
    domain: string | null
  ) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/tenants/${tenantId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name, domain }),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update tenant");
      }

      const data = await response.json();

      // Update the tenant in the list
      set((state) => ({
        tenants: state.tenants.map((t) =>
          t.id === tenantId ? data.tenant : t
        ),
        isLoading: false,
        error: null,
      }));

      console.log("[Tenant] Tenant updated successfully");
      return true;
    } catch (error: any) {
      console.error("[Tenant] Update tenant error:", error);
      set({
        error: error.message || "Failed to update tenant",
        isLoading: false,
      });
      return false;
    }
  },

  deleteTenant: async (token: string, tenantId: number) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/tenants/${tenantId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete tenant");
      }

      // Remove the tenant from the list
      set((state) => ({
        tenants: state.tenants.filter((t) => t.id !== tenantId),
        isLoading: false,
        error: null,
      }));

      console.log("[Tenant] Tenant deleted successfully");
      return true;
    } catch (error: any) {
      console.error("[Tenant] Delete tenant error:", error);
      set({
        error: error.message || "Failed to delete tenant",
        isLoading: false,
      });
      return false;
    }
  },

  uploadLogo: async (token: string, tenantId: number, file: File) => {
    set({ isLoading: true, error: null });

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch(
        `${API_BASE_URL}/api/tenants/${tenantId}/logo`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload logo");
      }

      // Update tenant has_logo flag
      set((state) => ({
        tenants: state.tenants.map((t) =>
          t.id === tenantId ? { ...t, has_logo: true } : t
        ),
        isLoading: false,
        error: null,
      }));

      console.log("[Tenant] Logo uploaded successfully");
      return true;
    } catch (error: any) {
      console.error("[Tenant] Upload logo error:", error);
      set({
        error: error.message || "Failed to upload logo",
        isLoading: false,
      });
      return false;
    }
  },

  deleteLogo: async (token: string, tenantId: number) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/tenants/${tenantId}/logo`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete logo");
      }

      // Update tenant has_logo flag
      set((state) => ({
        tenants: state.tenants.map((t) =>
          t.id === tenantId ? { ...t, has_logo: false } : t
        ),
        isLoading: false,
        error: null,
      }));

      console.log("[Tenant] Logo deleted successfully");
      return true;
    } catch (error: any) {
      console.error("[Tenant] Delete logo error:", error);
      set({
        error: error.message || "Failed to delete logo",
        isLoading: false,
      });
      return false;
    }
  },
}));
