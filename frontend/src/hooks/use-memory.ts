import { useState, useEffect, useCallback } from "react";
import type {
  MemoryStore,
  MemoryApiResponse,
  MemorySetResponse,
  MemoryDeleteResponse,
} from "@/types/memory";

const API_BASE_URL =
  (typeof window !== "undefined" && window.location.origin) || "http://localhost:5040";

export interface UseMemoryOptions {
  projectId?: string;
  autoLoad?: boolean;
}

export interface UseMemoryReturn {
  memory: MemoryStore;
  isLoading: boolean;
  error: string | null;
  loadMemory: () => Promise<void>;
  getCategory: (category: string) => Promise<Record<string, any>>;
  setMemoryValue: (category: string, key: string, value: any) => Promise<void>;
  deleteMemoryKey: (category: string, key: string) => Promise<void>;
  deleteCategory: (category: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMemory(options: UseMemoryOptions = {}): UseMemoryReturn {
  const { projectId = "A1", autoLoad = true } = options;

  const [memory, setMemory] = useState<MemoryStore>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all memory
  const loadMemory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/memory?projectId=${projectId}`);
      const data: MemoryApiResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load memory");
      }

      setMemory((data.data as MemoryStore) || {});
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load memory";
      setError(errorMessage);
      console.error("Error loading memory:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Get specific category
  const getCategory = useCallback(
    async (category: string): Promise<Record<string, any>> => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/memory?projectId=${projectId}&category=${category}`
        );
        const data: MemoryApiResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to get category");
        }

        return (data.data as Record<string, any>) || {};
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to get category";
        setError(errorMessage);
        console.error("Error getting category:", err);
        return {};
      }
    },
    [projectId]
  );

  // Set a memory value
  const setMemoryValue = useCallback(
    async (category: string, key: string, value: any) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/memory?projectId=${projectId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ category, key, value }),
        });

        const data: MemorySetResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to set memory value");
        }

        // Update local state
        setMemory((prev) => ({
          ...prev,
          [category]: {
            ...(prev[category] || {}),
            [key]: value,
          },
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to set memory value";
        setError(errorMessage);
        console.error("Error setting memory value:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  // Delete a specific key
  const deleteMemoryKey = useCallback(
    async (category: string, key: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/memory?projectId=${projectId}&category=${category}&key=${key}`,
          {
            method: "DELETE",
          }
        );

        const data: MemoryDeleteResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to delete memory key");
        }

        // Update local state
        setMemory((prev) => {
          const newMemory = { ...prev };
          if (newMemory[category]) {
            const newCategory = { ...newMemory[category] };
            delete newCategory[key];

            if (Object.keys(newCategory).length === 0) {
              delete newMemory[category];
            } else {
              newMemory[category] = newCategory;
            }
          }
          return newMemory;
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to delete memory key";
        setError(errorMessage);
        console.error("Error deleting memory key:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  // Delete entire category
  const deleteCategory = useCallback(
    async (category: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/memory?projectId=${projectId}&category=${category}`,
          {
            method: "DELETE",
          }
        );

        const data: MemoryDeleteResponse = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to delete category");
        }

        // Update local state
        setMemory((prev) => {
          const newMemory = { ...prev };
          delete newMemory[category];
          return newMemory;
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to delete category";
        setError(errorMessage);
        console.error("Error deleting category:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  // Refresh memory
  const refresh = useCallback(async () => {
    await loadMemory();
  }, [loadMemory]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad) {
      loadMemory();
    }
  }, [autoLoad, loadMemory]);

  return {
    memory,
    isLoading,
    error,
    loadMemory,
    getCategory,
    setMemoryValue,
    deleteMemoryKey,
    deleteCategory,
    refresh,
  };
}
