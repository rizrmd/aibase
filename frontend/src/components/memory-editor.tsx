import { useState } from "react";
import { useMemory } from "@/hooks/use-memory";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Edit2, Save, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface EditingEntry {
  category: string;
  key: string;
  value: string;
  isNew: boolean;
}

export function MemoryEditor() {
  const {
    memory,
    isLoading,
    error,
    setMemoryValue,
    deleteMemoryKey,
    deleteCategory,
    refresh,
  } = useMemory();

  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter memory based on search query
  const filteredMemory = Object.entries(memory).reduce(
    (acc, [category, entries]) => {
      if (searchQuery) {
        const lowercaseQuery = searchQuery.toLowerCase();
        if (
          category.toLowerCase().includes(lowercaseQuery) ||
          Object.keys(entries).some(
            (key) =>
              key.toLowerCase().includes(lowercaseQuery) ||
              String(entries[key]).toLowerCase().includes(lowercaseQuery)
          )
        ) {
          acc[category] = entries;
        }
      } else {
        acc[category] = entries;
      }
      return acc;
    },
    {} as typeof memory
  );

  const handleSave = async () => {
    if (!editingEntry) return;

    try {
      let valueToSave: any = editingEntry.value;

      // Try to parse as JSON if it looks like JSON
      if (
        (editingEntry.value.startsWith("{") &&
          editingEntry.value.endsWith("}")) ||
        (editingEntry.value.startsWith("[") && editingEntry.value.endsWith("]"))
      ) {
        try {
          valueToSave = JSON.parse(editingEntry.value);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      await setMemoryValue(
        editingEntry.category,
        editingEntry.key,
        valueToSave
      );
      toast.success(
        `Memory ${editingEntry.isNew ? "created" : "updated"} successfully`,
        {
          description: `${editingEntry.category}.${editingEntry.key}`,
        }
      );
      setEditingEntry(null);
      setNewCategory("");
    } catch (err) {
      toast.error("Failed to save memory", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleDelete = async (category: string, key: string) => {
    if (!confirm(`Delete ${category}.${key}?`)) return;

    try {
      await deleteMemoryKey(category, key);
      toast.success("Memory deleted successfully", {
        description: `${category}.${key}`,
      });
    } catch (err) {
      toast.error("Failed to delete memory", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleDeleteCategory = async (category: string) => {
    const keyCount = Object.keys(memory[category] || {}).length;
    if (!confirm(`Delete category "${category}" and all ${keyCount} keys?`))
      return;

    try {
      await deleteCategory(category);
      toast.success("Category deleted successfully", {
        description: `${category} (${keyCount} keys)`,
      });
    } catch (err) {
      toast.error("Failed to delete category", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleEdit = (category: string, key: string, value: any) => {
    setEditingEntry({
      category,
      key,
      value: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      isNew: false,
    });
  };

  const handleAddNew = () => {
    const category = newCategory || prompt("Enter category name:");
    if (!category) return;

    setEditingEntry({
      category,
      key: "",
      value: "",
      isNew: true,
    });
    setNewCategory("");
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">
              Error Loading Memory
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={refresh} variant="outline">
              <RefreshCw className="mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div></div>
        <div className="flex gap-2">
          <Button onClick={refresh} variant="outline" disabled={isLoading}>
            <RefreshCw className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button onClick={handleAddNew}>
            <Plus />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search categories, keys, or values..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-background border-input placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Editing Form */}
      {editingEntry && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{editingEntry.isNew ? "Add New Entry" : "Edit Entry"}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditingEntry(null)}
              >
                <X />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <input
                type="text"
                value={editingEntry.category}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, category: e.target.value })
                }
                disabled={!editingEntry.isNew}
                className="bg-background border-input placeholder:text-muted-foreground mt-1 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g., database, api_keys, settings"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Key</label>
              <input
                type="text"
                value={editingEntry.key}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, key: e.target.value })
                }
                className="bg-background border-input placeholder:text-muted-foreground mt-1 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g., postgresql_url, api_token"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Value</label>
              <textarea
                value={editingEntry.value}
                onChange={(e) =>
                  setEditingEntry({ ...editingEntry, value: e.target.value })
                }
                rows={4}
                className="bg-background border-input placeholder:text-muted-foreground mt-1 flex w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter value (string, JSON object, or JSON array)"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!editingEntry.category || !editingEntry.key}
              >
                <Save />
                Save
              </Button>
              <Button variant="outline" onClick={() => setEditingEntry(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memory List */}
      <div className="flex flex-wrap items-start flex-1 gap-[15px] overflow-y-auto">
        {isLoading && Object.keys(memory).length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-muted-foreground">Loading memory...</div>
          </div>
        ) : Object.keys(filteredMemory).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No matching entries found"
                  : "No memory entries yet"}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddNew}>
                  <Plus />
                  Add First Entry
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(filteredMemory).map(([category, entries]) => (
            <Card key={category} className="w-[calc(30%-30px)]">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>{category}</CardTitle>
                    <Badge variant="secondary">
                      {Object.keys(entries).length} keys
                    </Badge>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => handleDeleteCategory(category)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="space-y-3">
                  {Object.entries(entries).map(([key, value]) => (
                    <div
                      key={key}
                      className="bg-muted/50 flex items-start justify-between gap-4 rounded-lg p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 font-mono text-sm font-medium">
                          {key}
                        </div>
                        <div className="text-muted-foreground break-all font-mono text-xs">
                          {typeof value === "string"
                            ? value
                            : JSON.stringify(value, null, 2)}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEdit(category, key, value)}
                        >
                          <Edit2 />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(category, key)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
