import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildApiUrl } from "@/lib/base-path";

// Use buildApiUrl to support base path
const API_BASE_URL = buildApiUrl("");

export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  tenant_id: number;
  created_at: number;
  updated_at: number;
}

export interface AuthStore {
  // State
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  needsSetup: boolean;
  setupChecked: boolean;
  adminUser: User | null;
  adminToken: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setNeedsSetup: (needsSetup: boolean) => void;
  setSetupChecked: (checked: boolean) => void;

  // Async actions
  register: (email: string, username: string, password: string) => Promise<boolean>;
  login: (emailOrUsername: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  checkSetup: () => Promise<boolean>;
  stopImpersonating: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      needsSetup: false,
      setupChecked: false,
      adminUser: null,
      adminToken: null,

      // Synchronous actions
      setUser: (user) => {
        set({ user, isAuthenticated: user !== null });
      },

      setToken: (token) => {
        set({ token });
      },

      setError: (error) => {
        set({ error });
      },

      setIsLoading: (isLoading) => {
        set({ isLoading });
      },

      setNeedsSetup: (needsSetup) => {
        set({ needsSetup });
      },

      setSetupChecked: (checked) => {
        set({ setupChecked: checked });
      },

      // Async actions
      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, username, password }),
            credentials: "include",
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Registration failed");
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          console.log("[Auth] User registered successfully:", data.user.username);
          return true;
        } catch (error: any) {
          console.error("[Auth] Registration error:", error);
          set({
            error: error.message || "Registration failed",
            isLoading: false,
          });
          return false;
        }
      },

      login: async (emailOrUsername: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ emailOrUsername, password }),
            credentials: "include",
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Login failed");
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          console.log("[Auth] User logged in successfully:", data.user.username);
          return true;
        } catch (error: any) {
          console.error("[Auth] Login error:", error);
          set({
            error: error.message || "Login failed",
            isLoading: false,
          });
          return false;
        }
      },

      logout: async () => {
        const { token } = get();

        try {
          if (token) {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
            });
          }
        } catch (error) {
          console.error("[Auth] Logout error:", error);
        } finally {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null,
          });
          console.log("[Auth] User logged out");
        }
      },

      fetchCurrentUser: async () => {
        const { token } = get();

        if (!token) {
          set({ isAuthenticated: false, user: null });
          return;
        }

        set({ isLoading: true });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Session expired");
          }

          const data = await response.json();
          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          console.error("[Auth] Failed to fetch current user:", error);
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        const { token } = get();

        if (!token) {
          set({ error: "Not authenticated" });
          return false;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ currentPassword, newPassword }),
            credentials: "include",
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to change password");
          }

          set({ isLoading: false, error: null });
          console.log("[Auth] Password changed successfully");
          return true;
        } catch (error: any) {
          console.error("[Auth] Change password error:", error);
          set({
            error: error.message || "Failed to change password",
            isLoading: false,
          });
          return false;
        }
      },

      checkSetup: async () => {
        // Skip if already checked
        if (get().setupChecked) {
          return get().needsSetup;
        }

        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_BASE_URL}/api/setup/check`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          });

          if (!response.ok) {
            // If endpoint doesn't exist (old version), assume setup is done
            set({ needsSetup: false, setupChecked: true, isLoading: false });
            return false;
          }

          const data = await response.json();
          const needsSetup = data.needsSetup || false;

          set({ needsSetup, setupChecked: true, isLoading: false });
          console.log("[Auth] Setup check result:", needsSetup ? "Setup required" : "Setup complete");
          return needsSetup;
        } catch (error) {
          console.error("[Auth] Setup check error:", error);
          // On error, assume no setup needed to avoid blocking
          set({ needsSetup: false, setupChecked: true, isLoading: false });
          return false;
        }
      },

      stopImpersonating: () => {
        const { adminUser, adminToken } = get();
        if (adminUser && adminToken) {
          set({
            user: adminUser,
            token: adminToken,
            adminUser: null,
            adminToken: null,
            isAuthenticated: true,
          });
          console.log("[Auth] Stopped impersonating, restored admin session");
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        adminUser: state.adminUser,
        adminToken: state.adminToken,
      }),
    }
  )
);
