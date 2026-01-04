import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  AlertCircle,
  Upload,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ArrowLeft,
  Users,
} from "lucide-react";
import { toast } from "sonner";

interface SetupData {
  appName: string;
  hasLogo: boolean;
  updatedAt: number;
}

interface User {
  id: number;
  username: string;
  email: string;
  role: "root" | "admin" | "user";
  tenant_id: number | null;
}

interface Tenant {
  id: number;
  name: string;
  domain: string | null;
  has_logo: boolean;
  created_at: number;
  updated_at: number;
}

type Tab = "setup" | "tenants";
type TenantView = "list" | "detail";

const LICENSE_COOKIE_NAME = "admin_license_key";

// Cookie helper functions
const setLicenseCookie = (value: string) => {
  document.cookie = `${LICENSE_COOKIE_NAME}=${value}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict`;
};

const getLicenseCookie = (): string | null => {
  const cookies = document.cookie.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies[LICENSE_COOKIE_NAME] || null;
};

const clearLicenseCookie = () => {
  document.cookie = `${LICENSE_COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
};

export function AdminSetupPage() {
  const [licenseKey, setLicenseKey] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [appName, setAppName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const [tenantView, setTenantView] = useState<TenantView>("list");
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user" as "root" | "admin" | "user",
    tenant_id: undefined as number | undefined,
  });

  // Tenant management state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({
    name: "",
    domain: "",
  });

  // Helper to get users for a specific tenant
  const loadUsersForTenant = async (tenantId: number) => {
    if (!licenseKey) return;

    setLoadingUsers(true);
    try {
      const response = await fetch(`/api/admin/setup/users?licenseKey=${encodeURIComponent(licenseKey)}`);
      const data = await response.json();

      if (data.success) {
        // Filter users by tenant_id - include root users and users in this tenant
        const tenantUsers = data.users.filter((u: User) => {
          // Root users appear in all tenants
          if (u.role === "root") return true;
          // Users belonging to this tenant
          return u.tenant_id === tenantId;
        });
        setUsers(tenantUsers);
      } else {
        toast.error(data.error || "Failed to load users");
      }
    } catch (err) {
      console.error("Error loading users:", err);
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleTenantClick = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setTenantView("detail");
    loadUsersForTenant(tenant.id);
  };

  const handleBackToTenants = () => {
    setSelectedTenant(null);
    setTenantView("list");
    setUsers([]);
  };

  // Load current setup and check for license cookie on mount
  useEffect(() => {
    const initializeAuth = async () => {
      // Check for existing license cookie
      const storedLicenseKey = getLicenseCookie();

      if (storedLicenseKey) {
        setLicenseKey(storedLicenseKey);
        // Verify the stored license key
        await verifyLicenseKey(storedLicenseKey);
      }

      // Load setup data
      await loadSetup();
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // Load tenants when verified and on tenants tab
  useEffect(() => {
    if (isVerified && activeTab === "tenants" && tenantView === "list") {
      loadTenants();
    }
  }, [isVerified, activeTab, tenantView]);

  const verifyLicenseKey = async (key: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/admin/setup/verify-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key }),
      });

      const data = await response.json();

      if (data.success) {
        setIsVerified(true);
        setLicenseCookie(key);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  const loadSetup = async () => {
    try {
      const response = await fetch("/api/admin/setup");
      const data = await response.json();

      if (data.success) {
        setSetup(data.setup);
        if (data.setup?.appName) {
          setAppName(data.setup.appName);
        }
      }
    } catch (err) {
      console.error("Error loading setup:", err);
    }
  };

  const handleVerifyLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError(null);

    const success = await verifyLicenseKey(licenseKey);

    if (success) {
      toast.success("License key verified successfully");
    } else {
      setError("Invalid license key");
      toast.error("Invalid license key");
    }

    setVerifying(false);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("licenseKey", licenseKey);
      if (appName) {
        formData.append("appName", appName);
      }
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const response = await fetch("/api/admin/setup", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setSetup(data.setup);
        toast.success("Setup saved successfully!");
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setError(data.error || "Failed to save setup");
        toast.error(data.error || "Failed to save setup");
      }
    } catch (err) {
      const errorMsg = "Failed to save setup";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/admin/setup/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey,
          ...userForm,
          tenant_id: userForm.role !== "root" ? (userForm.tenant_id || selectedTenant?.id) : undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("User created successfully");
        setShowUserForm(false);
        setUserForm({ username: "", email: "", password: "", role: "user", tenant_id: undefined });
        // Reload users for current tenant if in detail view
        if (tenantView === "detail" && selectedTenant) {
          loadUsersForTenant(selectedTenant.id);
        }
      } else {
        toast.error(data.error || "Failed to create user");
      }
    } catch (err) {
      toast.error("Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setSaving(true);

    try {
      const response = await fetch(`/api/admin/setup/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey,
          ...userForm,
          tenant_id: userForm.role !== "root" ? (userForm.tenant_id || selectedTenant?.id) : undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("User updated successfully");
        setEditingUser(null);
        setShowUserForm(false);
        setUserForm({ username: "", email: "", password: "", role: "user", tenant_id: undefined });
        // Reload users for current tenant if in detail view
        if (tenantView === "detail" && selectedTenant) {
          loadUsersForTenant(selectedTenant.id);
        }
      } else {
        toast.error(data.error || "Failed to update user");
      }
    } catch (err) {
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete user "${user.username}"?`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/setup/users/${user.id}?licenseKey=${encodeURIComponent(licenseKey)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success("User deleted successfully");
        // Reload users for current tenant if in detail view
        if (tenantView === "detail" && selectedTenant) {
          loadUsersForTenant(selectedTenant.id);
        }
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch (err) {
      toast.error("Failed to delete user");
    }
  };

  const openEditForm = (user: User) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      email: user.email,
      password: "",
      role: user.role,
      tenant_id: user.tenant_id || undefined,
    });
    setShowUserForm(true);
  };

  const closeForm = () => {
    setShowUserForm(false);
    setEditingUser(null);
    setUserForm({ username: "", email: "", password: "", role: "user", tenant_id: undefined });
  };

  const loadTenants = async () => {
    if (!licenseKey) return;

    setLoadingTenants(true);
    try {
      const response = await fetch(`/api/admin/setup/tenants?licenseKey=${encodeURIComponent(licenseKey)}`);
      const data = await response.json();

      if (data.success) {
        setTenants(data.tenants);
      } else {
        toast.error(data.error || "Failed to load tenants");
      }
    } catch (err) {
      console.error("Error loading tenants:", err);
      toast.error("Failed to load tenants");
    } finally {
      setLoadingTenants(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/admin/setup/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey,
          ...tenantForm,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Tenant created successfully");
        setShowTenantForm(false);
        setTenantForm({ name: "", domain: "" });
        loadTenants();
      } else {
        toast.error(data.error || "Failed to create tenant");
      }
    } catch (err) {
      toast.error("Failed to create tenant");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    setSaving(true);

    try {
      const response = await fetch(`/api/admin/setup/tenants/${editingTenant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseKey,
          ...tenantForm,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Tenant updated successfully");
        setEditingTenant(null);
        setShowTenantForm(false);
        setTenantForm({ name: "", domain: "" });
        loadTenants();
      } else {
        toast.error(data.error || "Failed to update tenant");
      }
    } catch (err) {
      toast.error("Failed to update tenant");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (!confirm(`Are you sure you want to delete tenant "${tenant.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/setup/tenants/${tenant.id}?licenseKey=${encodeURIComponent(licenseKey)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success("Tenant deleted successfully");
        loadTenants();
      } else {
        toast.error(data.error || "Failed to delete tenant");
      }
    } catch (err) {
      toast.error("Failed to delete tenant");
    }
  };

  const openEditTenantForm = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setTenantForm({
      name: tenant.name,
      domain: tenant.domain || "",
    });
    setShowTenantForm(true);
  };

  const closeTenantForm = () => {
    setShowTenantForm(false);
    setEditingTenant(null);
    setTenantForm({ name: "", domain: "" });
  };

  const handleChangeLicenseKey = () => {
    clearLicenseCookie();
    setIsVerified(false);
    setLicenseKey("");
    setActiveTab("setup");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">Admin Setup</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your license key to continue
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            <Alert>
              <AlertCircle />
              <AlertTitle>License Key Required</AlertTitle>
              <AlertDescription>
                Enter your license key to access admin setup and manage your application.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleVerifyLicense} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="licenseKey">License Key</Label>
                <Input
                  id="licenseKey"
                  type="password"
                  placeholder="Enter your license key"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  required
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Contact your administrator if you don't have a license key
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={verifying}>
                {verifying ? "Verifying..." : "Verify License Key"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            {setup?.appName || "Admin Setup"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure your application settings
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("setup")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "setup"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            App Settings
          </button>
          <button
            onClick={() => {
              setActiveTab("tenants");
              setTenantView("list");
              setSelectedTenant(null);
            }}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "tenants"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tenant & User Management
          </button>
        </div>

        {/* Setup Tab */}
        {activeTab === "setup" && (
          <div className="space-y-6">
            <Alert>
              <CheckCircle2 />
              <AlertTitle>License Verified</AlertTitle>
              <AlertDescription>
                You can now modify your application settings
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSaveSetup} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="appName">Application Name</Label>
                <Input
                  id="appName"
                  type="text"
                  placeholder="Enter application name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This will override the APP_NAME environment variable
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo">Application Logo</Label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="cursor-pointer"
                    />
                  </div>
                  {logoPreview && (
                    <div className="relative h-16 w-16 border rounded-md overflow-hidden">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  {(setup?.hasLogo || logoPreview) && !logoPreview && (
                    <div className="h-16 w-16 border rounded-md flex items-center justify-center bg-muted">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a logo image (PNG, JPG, etc.) - will be saved to /data/logo.png
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </form>

            {setup?.updatedAt && (
              <div className="text-center text-xs text-muted-foreground">
                Last updated: {new Date(setup.updatedAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Tenants Tab */}
        {activeTab === "tenants" && (
          <div className="space-y-6">
            {/* Tenant Detail View */}
            {tenantView === "detail" && selectedTenant && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={handleBackToTenants}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tenants
                  </Button>
                  <h2 className="text-2xl font-bold">{selectedTenant.name}</h2>
                </div>

                <div className="border rounded-lg p-4 bg-muted/50">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Domain:</span>{" "}
                      {selectedTenant.domain ? (
                        <a
                          href={selectedTenant.domain}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-2"
                        >
                          {selectedTenant.domain}
                        </a>
                      ) : (
                        <span className="text-muted-foreground ml-2">Default domain</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>{" "}
                      <span className="text-muted-foreground ml-2">
                        {new Date(selectedTenant.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold">Users</h3>
                  <Button onClick={() => setShowUserForm(true)} disabled={showUserForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </div>

                {showUserForm && (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold">
                      {editingUser ? "Edit User" : "Create New User"}
                    </h3>
                    <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="username">Username</Label>
                          <Input
                            id="username"
                            type="text"
                            placeholder="username"
                            value={userForm.username}
                            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="user@example.com"
                            value={userForm.email}
                            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="password">
                            Password {editingUser && "(leave empty to keep current)"}
                          </Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={userForm.password}
                            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                            required={!editingUser}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="role">Role</Label>
                          <select
                            id="role"
                            value={userForm.role}
                            onChange={(e) =>
                              setUserForm({
                                ...userForm,
                                role: e.target.value as "root" | "admin" | "user",
                              })
                            }
                            className="w-full px-3 py-2 border rounded-md"
                            disabled={editingUser?.role === "root"}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            <option value="root">Root</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button type="submit" disabled={saving}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : editingUser ? "Update User" : "Create User"}
                        </Button>
                        <Button type="button" variant="outline" onClick={closeForm}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                {loadingUsers ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-sm text-muted-foreground">Loading users...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No users found in this tenant. Create your first user to get started.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium">Username</th>
                          <th className="px-4 py-2 text-left text-sm font-medium">Email</th>
                          <th className="px-4 py-2 text-left text-sm font-medium">Role</th>
                          <th className="px-4 py-2 text-right text-sm font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-muted/50">
                            <td className="px-4 py-3 text-sm">{user.username}</td>
                            <td className="px-4 py-3 text-sm">{user.email}</td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  user.role === "root"
                                    ? "bg-purple-100 text-purple-800"
                                    : user.role === "admin"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {user.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditForm(user)}
                                  title="Edit user"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user)}
                                  title="Delete user"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tenant List View */}
            {tenantView === "list" && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Tenants</h2>
                  <Button onClick={() => setShowTenantForm(true)} disabled={showTenantForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tenant
                  </Button>
                </div>

                {showTenantForm && (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h3 className="font-semibold">
                      {editingTenant ? "Edit Tenant" : "Create New Tenant"}
                    </h3>
                    <form onSubmit={editingTenant ? handleUpdateTenant : handleCreateTenant} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="tenantName">Name</Label>
                        <Input
                          id="tenantName"
                          type="text"
                          placeholder="My Organization"
                          value={tenantForm.name}
                          onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tenantDomain">Domain (Optional)</Label>
                        <Input
                          id="tenantDomain"
                          type="text"
                          placeholder="https://example.com"
                          value={tenantForm.domain}
                          onChange={(e) => setTenantForm({ ...tenantForm, domain: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Custom domain for this tenant (leave empty for default domain)
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button type="submit" disabled={saving}>
                          <Save className="h-4 w-4 mr-2" />
                          {saving ? "Saving..." : editingTenant ? "Update Tenant" : "Create Tenant"}
                        </Button>
                        <Button type="button" variant="outline" onClick={closeTenantForm}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                {loadingTenants ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-2 text-sm text-muted-foreground">Loading tenants...</p>
                  </div>
                ) : tenants.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No tenants found. Create your first tenant to get started.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium">Name</th>
                          <th className="px-4 py-2 text-left text-sm font-medium">Domain</th>
                          <th className="px-4 py-2 text-left text-sm font-medium">Created</th>
                          <th className="px-4 py-2 text-right text-sm font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {tenants.map((tenant) => (
                          <tr key={tenant.id} className="hover:bg-muted/50">
                            <td className="px-4 py-3 text-sm font-medium">{tenant.name}</td>
                            <td className="px-4 py-3 text-sm">
                              {tenant.domain ? (
                                <a
                                  href={tenant.domain}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {tenant.domain}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">Default domain</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date(tenant.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTenantClick(tenant)}
                                  title="View users"
                                >
                                  <Users className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditTenantForm(tenant)}
                                  title="Edit tenant"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTenant(tenant)}
                                  title="Delete tenant"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleChangeLicenseKey}
        >
          Change License Key
        </Button>
      </div>
    </div>
  );
}
