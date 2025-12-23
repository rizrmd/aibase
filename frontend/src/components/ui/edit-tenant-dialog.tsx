import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Alert } from "./alert";
import { useAuthStore } from "@/stores/auth-store";
import { useTenantStore, type Tenant } from "@/stores/tenant-store";
import { Upload, X, Trash2 } from "lucide-react";
import { buildApiUrl } from "@/lib/base-path";

const API_BASE_URL = buildApiUrl("");

interface EditTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant | null;
}

export function EditTenantDialog({ open, onOpenChange, tenant }: EditTenantDialogProps) {
  const token = useAuthStore((state) => state.token);
  const { updateTenant, uploadLogo, deleteLogo, isLoading, error, setError } = useTenantStore();

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [hasExistingLogo, setHasExistingLogo] = useState(false);

  // Update form when tenant changes
  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setDomain(tenant.domain || "");
      setHasExistingLogo(tenant.has_logo);
      setLogoFile(null);
      setLogoPreview(null);
    }
  }, [tenant]);

  // Reset form
  const resetForm = () => {
    setName("");
    setDomain("");
    setLogoFile(null);
    setLogoPreview(null);
    setHasExistingLogo(false);
    setError(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setError("Invalid file type. Only PNG and JPG are allowed");
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("File too large. Maximum size is 5MB");
      return;
    }

    setLogoFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveNewLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleDeleteExistingLogo = async () => {
    if (!token || !tenant) return;

    const success = await deleteLogo(token, tenant.id);
    if (success) {
      setHasExistingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token || !tenant) {
      setError("Not authenticated or no tenant selected");
      return;
    }

    // Update tenant info
    const success = await updateTenant(token, tenant.id, name, domain || null);
    if (!success) return;

    // Upload new logo if provided
    if (logoFile) {
      const logoSuccess = await uploadLogo(token, tenant.id, logoFile);
      if (!logoSuccess) {
        setError("Tenant updated but logo upload failed");
        return;
      }
    }

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
          <DialogDescription>
            Update tenant information
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tenant Name *</Label>
            <Input
              id="name"
              type="text"
              placeholder="Acme Corporation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              type="text"
              placeholder="acme.example.com (optional)"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Custom domain for this tenant
            </p>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>

            {/* Show existing logo */}
            {hasExistingLogo && !logoPreview && tenant && (
              <div className="relative inline-block">
                <img
                  src={`${API_BASE_URL}/api/tenants/${tenant.id}/logo`}
                  alt="Current logo"
                  className="size-24 rounded-lg border object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  className="absolute -top-2 -right-2"
                  onClick={handleDeleteExistingLogo}
                  title="Delete logo"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            )}

            {/* Show new logo preview */}
            {logoPreview && (
              <div className="relative inline-block">
                <img
                  src={logoPreview}
                  alt="New logo preview"
                  className="size-24 rounded-lg border object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  className="absolute -top-2 -right-2"
                  onClick={handleRemoveNewLogo}
                  title="Remove new logo"
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}

            {/* Show upload button when no logo is displayed */}
            {!hasExistingLogo && !logoPreview && (
              <div className="relative">
                <Input
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <Label
                  htmlFor="logo"
                  className="flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload logo (PNG/JPG, max 5MB)
                  </span>
                </Label>
              </div>
            )}

            {/* Upload replacement button */}
            {(hasExistingLogo || logoPreview) && (
              <div className="mt-2">
                <Input
                  id="logo-replace"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <Label
                  htmlFor="logo-replace"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Upload className="size-3" />
                  <span>Replace logo</span>
                </Label>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? "Updating..." : "Update Tenant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
