/**
 * Extensions Settings Component (Upgraded with Category Management)
 * Manage project-specific extensions organized by categories
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCategory,
  deleteCategory as deleteCategoryApi,
  getCategories,
  updateCategory,
} from "@/lib/api/categories";
import {
  deleteExtension,
  getExtensions,
  getExtensionDebugLogs,
  reloadExtension,
  resetExtensionsToDefaults,
  toggleExtension,
  toggleExtensionDebug,
  toggleExtensionSource,
  updateExtension,
} from "@/lib/api/extensions";
import { useProjectStore } from "@/stores/project-store";
import type { Category } from "@/types/category";
import type { Extension } from "@/types/extension";
import {
  ArrowUpDown,
  Bug,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderOpen,
  PowerIcon,
  RefreshCw,
  RotateCw,
  Settings,
  Trash2,
  Wand2
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface CategoryGroup {
  category: Category;
  extensions: Extension[];
  expanded: boolean;
}

export function ExtensionsSettings() {
  const { currentProject } = useProjectStore();
  const navigate = useNavigate();

  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Category management state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryEditMode, setCategoryEditMode] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    id: "",
    name: "",
    description: "",
  });

  // Confirmation dialogs state
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<{
    open: boolean;
    categoryId: string;
  }>({ open: false, categoryId: "" });
  const [resetExtensionsDialog, setResetExtensionsDialog] = useState(false);

  // Delete extension dialog state
  const [deleteExtensionDialog, setDeleteExtensionDialog] = useState<{
    open: boolean;
    extensionId: string;
    extensionName: string;
  }>({ open: false, extensionId: "", extensionName: "" });

  // Change category dialog state
  const [changeCategoryDialog, setChangeCategoryDialog] = useState<{
    open: boolean;
    extensionId: string;
    extensionName: string;
    currentCategory: string;
    newCategory: string;
  }>({
    open: false,
    extensionId: "",
    extensionName: "",
    currentCategory: "",
    newCategory: "",
  });

  // Reloading extensions state
  const [reloadingExtensions, setReloadingExtensions] = useState<Set<string>>(new Set());

  // Debug logs state
  const [expandedDebugLogs, setExpandedDebugLogs] = useState<Set<string>>(new Set());
  const [debugLogsTab, setDebugLogsTab] = useState<Record<string, 'frontend' | 'backend'>>({});
  const [backendLogs, setBackendLogs] = useState<Record<string, any[]>>({});
  const [frontendLogs, setFrontendLogs] = useState<Record<string, any[]>>({});

  // Load data
  const loadData = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const [extData, catData] = await Promise.all([
        getExtensions(currentProject.id),
        getCategories(currentProject.id),
      ]);
      setExtensions(extData);

      // Group extensions by category
      const groups: CategoryGroup[] = catData.map((cat) => ({
        category: cat,
        extensions: extData.filter((ext) => ext.metadata.category === cat.id),
        expanded: true, // Default expanded
      }));

      // Add uncategorized extensions group (extensions with empty/undefined category)
      const uncategorizedExtensions = extData.filter(
        (ext) => !ext.metadata.category || ext.metadata.category === "",
      );
      if (uncategorizedExtensions.length > 0) {
        groups.push({
          category: {
            id: "",
            name: "Uncategorized",
            description: "Extensions without a category",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          extensions: uncategorizedExtensions,
          expanded: true,
        });
      }

      setCategoryGroups(groups);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to load extensions",
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    if (currentProject) {
      loadData();
    }
  }, [currentProject, loadData]);

  // Handle toggle extension
  const handleToggle = async (extensionId: string) => {
    if (!currentProject) return;

    try {
      const updated = await toggleExtension(currentProject.id, extensionId);
      setExtensions((prev) =>
        prev.map((ext) => (ext.metadata.id === extensionId ? updated : ext)),
      );
      // Update category groups
      setCategoryGroups((prev) =>
        prev.map((group) => ({
          ...group,
          extensions: group.extensions.map((ext) =>
            ext.metadata.id === extensionId ? updated : ext,
          ),
        })),
      );
      toast.success(
        updated.metadata.enabled ? "Extension enabled" : "Extension disabled",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to toggle extension",
      );
    }
  };

  // Handle reload extension
  const handleReload = async (extensionId: string, extensionName: string) => {
    if (!currentProject) return;

    setReloadingExtensions(prev => new Set(prev).add(extensionId));

    try {
      await reloadExtension(currentProject.id, extensionId);
      const { clearExtensionComponentCache } = await import("@/components/ui/chat/tools/extension-component-registry");
      clearExtensionComponentCache(extensionId, currentProject.id);
      toast.success(`Extension "${extensionName}" reloaded successfully`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reload extension");
    } finally {
      setReloadingExtensions(prev => {
        const next = new Set(prev);
        next.delete(extensionId);
        return next;
      });
    }
  };

  // Handle toggle debug mode
  const handleToggleDebug = async (extensionId: string) => {
    if (!currentProject) return;

    try {
      const extension = extensions.find(e => e.metadata.id === extensionId);
      if (!extension) return;

      const newDebugState = !extension.metadata.debug;
      const updated = await toggleExtensionDebug(currentProject.id, extensionId, newDebugState);

      setExtensions((prev) =>
        prev.map((ext) => (ext.metadata.id === extensionId ? updated : ext)),
      );
      setCategoryGroups((prev) =>
        prev.map((group) => ({
          ...group,
          extensions: group.extensions.map((ext) =>
            ext.metadata.id === extensionId ? updated : ext,
          ),
        })),
      );

      toast.success(
        newDebugState ? "Debug mode enabled" : "Debug mode disabled",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to toggle debug mode",
      );
    }
  };

  // Handle toggle extension source (default/project)
  const handleToggleSource = async (extensionId: string) => {
    if (!currentProject) return;

    try {
      const extension = extensions.find(e => e.metadata.id === extensionId);
      if (!extension) return;

      // Determine target source (opposite of current)
      const targetSource = extension.source === 'project' ? 'default' : 'project';

      // Show confirmation for switching to default (deletes customizations)
      if (targetSource === 'default') {
        const confirmed = window.confirm(
          `Switch to default version? Your customizations for "${extension.metadata.name}" will be removed.`
        );
        if (!confirmed) return;
      }

      const result = await toggleExtensionSource(currentProject.id, extensionId, targetSource);

      // Reload data to get updated extension list
      await loadData();

      toast.success(result.data.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to toggle extension source",
      );
    }
  };

  // Handle toggle debug logs expansion
  const handleToggleDebugLogs = async (extensionId: string) => {
    const isExpanded = expandedDebugLogs.has(extensionId);

    if (isExpanded) {
      // Collapse
      setExpandedDebugLogs(prev => {
        const next = new Set(prev);
        next.delete(extensionId);
        return next;
      });
    } else {
      // Expand and load logs
      if (!currentProject) return;

      setExpandedDebugLogs(prev => new Set(prev).add(extensionId));

      // Set default tab if not set
      setDebugLogsTab(prev => ({
        ...prev,
        [extensionId]: prev[extensionId] || 'backend',
      }));

      // Load all logs (both frontend and backend) from backend
      try {
        const logs = await getExtensionDebugLogs(currentProject.id, extensionId);

        // Split logs by source
        const frontendLogs = logs.filter(log => log.source === 'frontend');
        const backendLogs = logs.filter(log => log.source === 'backend');

        setFrontendLogs(prev => ({ ...prev, [extensionId]: frontendLogs }));
        setBackendLogs(prev => ({ ...prev, [extensionId]: backendLogs }));
      } catch (error) {
        console.error('Failed to load debug logs:', error);
      }
    }
  };

  // Handle refresh debug logs
  const handleRefreshDebugLogs = async (extensionId: string) => {
    if (!currentProject) return;

    try {
      const logs = await getExtensionDebugLogs(currentProject.id, extensionId);

      // Split logs by source
      const frontendLogs = logs.filter(log => log.source === 'frontend');
      const backendLogs = logs.filter(log => log.source === 'backend');

      setFrontendLogs(prev => ({ ...prev, [extensionId]: frontendLogs }));
      setBackendLogs(prev => ({ ...prev, [extensionId]: backendLogs }));

      toast.success('Debug logs refreshed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh debug logs');
    }
  };

  // Handle bulk toggle per category
  const handleBulkToggle = async (categoryId: string, enable: boolean) => {
    if (!currentProject) return;

    const group = categoryGroups.find((g) => g.category.id === categoryId);
    if (!group) return;

    const extensionsToToggle = group.extensions.filter(
      (ext) => ext.metadata.enabled !== enable,
    );

    if (extensionsToToggle.length === 0) {
      toast.info(
        enable
          ? "All extensions already enabled"
          : "All extensions already disabled",
      );
      return;
    }

    // Toggle each extension
    for (const ext of extensionsToToggle) {
      try {
        const updated = await toggleExtension(
          currentProject.id,
          ext.metadata.id,
        );
        setExtensions((prev) =>
          prev.map((e) => (e.metadata.id === ext.metadata.id ? updated : e)),
        );
        // Update category groups without changing expanded state
        setCategoryGroups((prev) =>
          prev.map((g) => ({
            ...g,
            extensions: g.extensions.map((e) =>
              e.metadata.id === ext.metadata.id ? updated : e,
            ),
          })),
        );
      } catch (error) {
        console.error(`Failed to toggle ${ext.metadata.name}:`, error);
      }
    }

    toast.success(
      `${enable ? "Enabled" : "Disabled"} ${extensionsToToggle.length} extension(s)`,
    );
  };

  // Handle delete extension
  const handleDelete = (extensionId: string, extensionName: string) => {
    if (!currentProject) return;
    // Open confirmation dialog instead of browser confirm
    setDeleteExtensionDialog({
      open: true,
      extensionId,
      extensionName,
    });
  };

  // Confirm delete extension
  const confirmDeleteExtension = async () => {
    if (!currentProject || !deleteExtensionDialog.extensionId) return;

    try {
      await deleteExtension(
        currentProject.id,
        deleteExtensionDialog.extensionId,
      );
      await loadData();
      toast.success("Extension deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete extension",
      );
    } finally {
      setDeleteExtensionDialog({
        open: false,
        extensionId: "",
        extensionName: "",
      });
    }
  };

  // Handle reset to defaults
  const handleResetToDefaults = async () => {
    if (!currentProject) return;
    // Open confirmation dialog instead of browser confirm
    setResetExtensionsDialog(true);
  };

  const confirmResetExtensions = async () => {
    if (!currentProject) return;

    try {
      const defaults = await resetExtensionsToDefaults(currentProject.id);
      setExtensions(defaults);
      await loadData();
      toast.success("Extensions reset to defaults");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reset extensions",
      );
    } finally {
      setResetExtensionsDialog(false);
    }
  };

  // Handle AI extension creator
  const handleAICreator = () => {
    if (!currentProject) return;
    navigate(`/projects/${currentProject.id}/extensions/ai-create`);
  };

  // Open change category dialog
  const openChangeCategoryDialog = (extension: Extension) => {
    setChangeCategoryDialog({
      open: true,
      extensionId: extension.metadata.id,
      extensionName: extension.metadata.name,
      currentCategory: extension.metadata.category || "",
      newCategory: extension.metadata.category || "",
    });
  };

  // Handle change category
  const handleChangeCategory = async () => {
    if (!currentProject || !changeCategoryDialog.extensionId) return;

    try {
      await updateExtension(
        currentProject.id,
        changeCategoryDialog.extensionId,
        {
          category: changeCategoryDialog.newCategory,
        },
      );
      await loadData();
      toast.success(
        `Moved '${changeCategoryDialog.extensionName}' to new category`,
      );
      setChangeCategoryDialog({ ...changeCategoryDialog, open: false });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to change category",
      );
    }
  };

  // Toggle category expanded state
  const toggleCategoryExpanded = (categoryId: string) => {
    setCategoryGroups((prev) =>
      prev.map((group) =>
        group.category.id === categoryId
          ? { ...group, expanded: !group.expanded }
          : group,
      ),
    );
  };

  // Category management handlers
  const openAddCategoryDialog = () => {
    setCategoryEditMode(false);
    setEditingCategory(null);
    setCategoryForm({ id: "", name: "", description: "" });
    setCategoryDialogOpen(true);
  };

  const openEditCategoryDialog = (category: Category) => {
    setCategoryEditMode(true);
    setEditingCategory(category);
    setCategoryForm({
      id: category.id,
      name: category.name,
      description: category.description || "",
    });
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!currentProject) return;

    if (!categoryForm.id || !categoryForm.name) {
      toast.error("ID and name are required");
      return;
    }

    try {
      if (categoryEditMode && editingCategory) {
        // Update existing category
        const updated = await updateCategory(
          currentProject.id,
          editingCategory.id,
          {
            name: categoryForm.name,
            description: categoryForm.description,
          },
        );
        setCategoryGroups((prev: CategoryGroup[]) =>
          prev.map((group: CategoryGroup) =>
            group.category.id === updated.id
              ? { ...group, category: updated }
              : group,
          ),
        );
        toast.success("Category updated");
      } else {
        // Create new category
        const created = await createCategory(currentProject.id, {
          id: categoryForm.id,
          name: categoryForm.name,
          description: categoryForm.description,
        });
        setCategoryGroups((prev: CategoryGroup[]) => [
          ...prev,
          { category: created, extensions: [], expanded: true },
        ]);
        toast.success("Category created");
      }
      setCategoryDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save category",
      );
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!currentProject) return;
    // Open confirmation dialog instead of browser confirm
    setDeleteCategoryDialog({ open: true, categoryId });
  };

  const confirmDeleteCategory = async () => {
    if (!currentProject || !deleteCategoryDialog.categoryId) return;

    try {
      await deleteCategoryApi(
        currentProject.id,
        deleteCategoryDialog.categoryId,
      );
      await loadData();
      toast.success("Category deleted");
      // Close edit category dialog after successful deletion
      setCategoryDialogOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete category",
      );
    } finally {
      setDeleteCategoryDialog({ open: false, categoryId: "" });
    }
  };

  // Filter by search term
  const filteredGroups = categoryGroups
    .map((group) => ({
      ...group,
      extensions: group.extensions.filter(
        (ext) =>
          ext.metadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ext.metadata.description
            .toLowerCase()
            .includes(searchTerm.toLowerCase()),
      ),
    }))
    .filter((group) => group.extensions.length > 0 || !searchTerm);

  if (isLoading && extensions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading extensions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pt-[60px] md:px-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Extensions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage project-specific extensions organized by category
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            disabled={isLoading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={openAddCategoryDialog}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Add Category
          </Button>
          <Button variant="outline" size="sm" onClick={handleAICreator}>
            <Wand2 className="w-4 h-4 mr-2" />
            New Extension
          </Button>
        </div>
      </div>

      {/* Search */}
      <div>
        <Label htmlFor="search">Search Extensions</Label>
        <Input
          id="search"
          placeholder="Search by name or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mt-1.5"
        />
      </div>

      {/* Category Groups */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchTerm ? "No extensions found" : "No extensions yet"}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const enabledCount = group.extensions.filter(
              (ext) => ext.metadata.enabled,
            ).length;
            const totalCount = group.extensions.length;

            return (
              <div
                key={group.category.id}
                className="border rounded-lg overflow-hidden"
              >
                {/* Category Header */}
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0 h-6 w-6"
                      onClick={() => toggleCategoryExpanded(group.category.id)}
                    >
                      {group.expanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => toggleCategoryExpanded(group.category.id)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{group.category.name}</h3>
                        <span className="text-xs bg-muted-foreground/20 px-2 py-0.5 rounded">
                          {enabledCount}/{totalCount} enabled
                        </span>
                      </div>
                      {group.category.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {group.category.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Category Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleBulkToggle(group.category.id, true)}
                      disabled={enabledCount === totalCount}
                      title="Enable all in category"
                    >
                      <PowerIcon className={`w-4 h-4 text-green-500`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleBulkToggle(group.category.id, false)}
                      disabled={enabledCount === 0}
                      title="Disable all in category"
                    >
                      <PowerIcon className={`w-4 h-4 text-slate-400`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCategoryDialog(group.category)}
                      title="Edit category"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Extensions List (Collapsible) */}
                {group.expanded && (
                  <div className="divide-y">
                    {group.extensions.length === 0 ? (
                      <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                        No extensions in this category
                      </div>
                    ) : (
                      group.extensions.map((extension) => (
                        <div
                          key={extension.metadata.id}
                          className="px-4 py-3 md:pl-[50px] hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold truncate">
                                  {extension.metadata.name}
                                </h4>
                                {extension.source === 'project' && (
                                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded flex-shrink-0" title="Using project version (customizable)">
                                    Custom
                                  </span>
                                )}
                                {extension.source === 'default' && extension.hasProjectVersion && (
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded flex-shrink-0" title="Default version available, can customize">
                                    Default
                                  </span>
                                )}
                                {extension.source === 'default' && !extension.hasProjectVersion && (
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded flex-shrink-0" title="Default version (no project copy)">
                                    Default
                                  </span>
                                )}
                                {!extension.metadata.enabled && (
                                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded flex-shrink-0">
                                    Disabled
                                  </span>
                                )}
                                {extension.metadata.hasError && (
                                  <button
                                    onClick={() => handleToggleDebugLogs(extension.metadata.id)}
                                    className="text-xs bg-destructive text-destructive px-2 py-0.5 rounded flex-shrink-0 hover:opacity-80 cursor-pointer"
                                    title={`Error: ${extension.metadata.lastError}`}
                                  >
                                    Error
                                  </button>
                                )}
                                {extension.metadata.debug && (
                                  <button
                                    onClick={() => handleToggleDebugLogs(extension.metadata.id)}
                                    className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded flex-shrink-0 hover:opacity-80 cursor-pointer"
                                    title="Debug mode enabled"
                                  >
                                    Debug
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {extension.metadata.description}
                              </p>
                              <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                                <span>v{extension.metadata.version}</span>
                                {extension.metadata.author && (
                                  <span>by {extension.metadata.author}</span>
                                )}
                              </div>
                            </div>

                            {/* Extension Actions */}
                            <div className="flex gap-1 ml-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleToggle(extension.metadata.id)
                                }
                                title={
                                  extension.metadata.enabled
                                    ? "Disable"
                                    : "Enable"
                                }
                              >
                                <PowerIcon
                                  className={`w-4 h-4 ${
                                    extension.metadata.enabled
                                      ? "text-green-500"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleReload(extension.metadata.id, extension.metadata.name)
                                }
                                disabled={reloadingExtensions.has(extension.metadata.id)}
                                title="Reload extension (clear caches)"
                              >
                                <RotateCw className={`w-4 h-4 ${reloadingExtensions.has(extension.metadata.id) ? "animate-spin" : ""}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleToggleDebug(extension.metadata.id)
                                }
                                title={extension.metadata.debug ? "Disable debug mode" : "Enable debug mode"}
                              >
                                <Bug className={`w-4 h-4 ${extension.metadata.debug ? "text-blue-500" : "text-muted-foreground"}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleToggleSource(extension.metadata.id)
                                }
                                title={
                                  extension.source === 'project'
                                    ? "Switch to default (removes customizations)"
                                    : extension.hasProjectVersion
                                    ? "Switch to project version (customizable)"
                                    : "Copy to project (allows customization)"
                                }
                              >
                                {extension.source === 'project' ? (
                                  <RotateCw className="w-4 h-4 text-primary" />
                                ) : (
                                  <Copy className={`w-4 h-4 ${extension.hasProjectVersion ? "text-primary" : "text-muted-foreground"}`} />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  openChangeCategoryDialog(extension)
                                }
                                title="Change category"
                              >
                                <ArrowUpDown className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleDelete(
                                    extension.metadata.id,
                                    extension.metadata.name,
                                  )
                                }
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Debug Logs Viewer (Inline Expansion) */}
                          {expandedDebugLogs.has(extension.metadata.id) && (
                            <div className="mt-4 border rounded-lg bg-background">
                              {/* Tabs */}
                              <div className="flex items-center gap-2 px-4 py-2 border-b">
                                <button
                                  onClick={() => setDebugLogsTab(prev => ({ ...prev, [extension.metadata.id]: 'frontend' }))}
                                  className={`px-3 py-1 text-sm rounded ${
                                    debugLogsTab[extension.metadata.id] === 'frontend'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted hover:bg-muted/70'
                                  }`}
                                >
                                  Frontend
                                </button>
                                <button
                                  onClick={() => setDebugLogsTab(prev => ({ ...prev, [extension.metadata.id]: 'backend' }))}
                                  className={`px-3 py-1 text-sm rounded ${
                                    debugLogsTab[extension.metadata.id] === 'backend'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted hover:bg-muted/70'
                                  }`}
                                >
                                  Backend
                                </button>
                                <div className="flex-1" />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRefreshDebugLogs(extension.metadata.id)}
                                  className="h-7"
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Refresh
                                </Button>
                              </div>

                              {/* Log Content */}
                              <div className="p-4 max-h-96 overflow-y-auto">
                                {debugLogsTab[extension.metadata.id] === 'frontend' ? (
                                  // Frontend Logs
                                  <div className="text-sm">
                                    {(frontendLogs[extension.metadata.id] || []).length === 0 ? (
                                      <div className="text-center py-8 text-muted-foreground text-sm">
                                        No frontend debug logs yet
                                        <p className="text-xs mt-1">
                                          Extension UI components can log errors using the extensionLogger utility
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {frontendLogs[extension.metadata.id].map((log, idx) => (
                                          <div key={idx} className="border rounded p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                log.level === 'error' ? 'bg-destructive text-destructive' :
                                                log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-500' :
                                                log.level === 'info' ? 'bg-blue-500/10 text-blue-500' :
                                                'bg-muted text-muted-foreground'
                                              }`}>
                                                {log.level.toUpperCase()}
                                              </span>
                                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                log.source === 'frontend' ? 'bg-purple-500/10 text-purple-500' : 'bg-green-500/10 text-green-500'
                                              }`}>
                                                {log.source === 'frontend' ? 'UI' : 'Worker'}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleTimeString()}
                                              </span>
                                            </div>
                                            <div className="text-sm">
                                              {log.message}
                                            </div>
                                            {log.data && (
                                              <details className="mt-2">
                                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                                  View details
                                                </summary>
                                                        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                                                  {typeof log.data === 'object'
                                                    ? JSON.stringify(log.data, null, 2)
                                                    : String(log.data)}
                                                </pre>
                                              </details>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  // Backend Logs
                                  <div className="text-sm">
                                    {(backendLogs[extension.metadata.id] || []).length === 0 ? (
                                      <div className="text-center py-8 text-muted-foreground text-sm">
                                        No debug logs available
                                        <p className="text-xs mt-1">
                                          Enable debug mode to start logging extension execution
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {backendLogs[extension.metadata.id].map((log, idx) => (
                                          <div key={idx} className="border rounded p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                log.level === 'error' ? 'bg-destructive text-destructive' :
                                                log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-500' :
                                                log.level === 'info' ? 'bg-blue-500/10 text-blue-500' :
                                                'bg-muted text-muted-foreground'
                                              }`}>
                                                {log.level.toUpperCase()}
                                              </span>
                                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                log.source === 'frontend' ? 'bg-purple-500/10 text-purple-500' : 'bg-green-500/10 text-green-500'
                                              }`}>
                                                {log.source === 'frontend' ? 'UI' : 'Worker'}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleTimeString()}
                                              </span>
                                            </div>
                                            <div className="text-sm font-mono text-foreground">
                                              {log.message}
                                            </div>
                                            {log.data && (
                                              <details className="mt-2">
                                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                                  View details
                                                </summary>
                                                <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                                                  {JSON.stringify(log.data, null, 2)}
                                                </pre>
                                              </details>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {categoryEditMode ? "Edit Category" : "Add Category"}
            </DialogTitle>
            <DialogDescription>
              {categoryEditMode
                ? "Update category details"
                : "Create a new category for organizing extensions"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="cat-id">Category ID</Label>
              <Input
                id="cat-id"
                placeholder="e.g., database-tools"
                value={categoryForm.id}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, id: e.target.value })
                }
                disabled={categoryEditMode}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Unique identifier (lowercase, hyphens only)
              </p>
            </div>

            <div>
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                placeholder="e.g., Database Tools"
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, name: e.target.value })
                }
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="cat-desc">Description (Optional)</Label>
              <Input
                id="cat-desc"
                placeholder="What kind of extensions go here?"
                value={categoryForm.description}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    description: e.target.value,
                  })
                }
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            {categoryEditMode && editingCategory && (
              <Button
                variant="destructive"
                onClick={() => handleDeleteCategory(editingCategory.id)}
              >
                Delete
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCategory}>
              {categoryEditMode ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation Dialog */}
      <Dialog
        open={deleteCategoryDialog.open}
        onOpenChange={(open: boolean) =>
          setDeleteCategoryDialog({
            open,
            categoryId: deleteCategoryDialog.categoryId,
          })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription className="text-left">
              Are you sure you want to delete this category? Extensions in this
              category will become uncategorized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteCategoryDialog({ open: false, categoryId: "" })
              }
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCategory}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Extensions Confirmation Dialog */}
      <Dialog
        open={resetExtensionsDialog}
        onOpenChange={setResetExtensionsDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Extensions to Defaults</DialogTitle>
            <DialogDescription className="text-left">
              Are you sure you want to reset all extensions to defaults? This
              will delete all custom extensions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetExtensionsDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmResetExtensions}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Category Dialog */}
      <Dialog
        open={changeCategoryDialog.open}
        onOpenChange={(open: boolean) =>
          setChangeCategoryDialog({ ...changeCategoryDialog, open })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Extension Category</DialogTitle>
            <DialogDescription>
              Move "{changeCategoryDialog.extensionName}" to a different
              category
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="category-select">Select Category</Label>
            <select
              id="category-select"
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={changeCategoryDialog.newCategory}
              onChange={(e) =>
                setChangeCategoryDialog({
                  ...changeCategoryDialog,
                  newCategory: e.target.value,
                })
              }
            >
              {categoryGroups.map((group) => (
                <option key={group.category.id} value={group.category.id}>
                  {group.category.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              Current category:{" "}
              {changeCategoryDialog.currentCategory || "Uncategorized"}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setChangeCategoryDialog({
                  ...changeCategoryDialog,
                  open: false,
                })
              }
            >
              Cancel
            </Button>
            <Button onClick={handleChangeCategory}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Extension Confirmation Dialog */}
      <Dialog
        open={deleteExtensionDialog.open}
        onOpenChange={(open: boolean) =>
          setDeleteExtensionDialog({ ...deleteExtensionDialog, open })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Extension</DialogTitle>
            <DialogDescription className="text-left">
              Are you sure you want to delete "
              {deleteExtensionDialog.extensionName}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteExtensionDialog({
                  open: false,
                  extensionId: "",
                  extensionName: "",
                })
              }
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteExtension}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
