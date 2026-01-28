/**
 * Extensions API client
 */

import type {
  Extension,
  CreateExtensionData,
  UpdateExtensionData,
} from "../../types/extension";

const API_BASE_URL = "/api";

/**
 * Get all extensions for a project
 */
export async function getExtensions(projectId: string): Promise<Extension[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get extensions");
  }

  const data = await response.json();
  return data.data.extensions;
}

/**
 * Get a specific extension
 */
export async function getExtension(
  projectId: string,
  extensionId: string
): Promise<Extension> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get extension");
  }

  const data = await response.json();
  return data.data.extension;
}

/**
 * Create a new extension
 */
export async function createExtension(
  projectId: string,
  extensionData: CreateExtensionData
): Promise<Extension> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(extensionData),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create extension");
  }

  const data = await response.json();
  return data.data.extension;
}

/**
 * Update an extension
 */
export async function updateExtension(
  projectId: string,
  extensionId: string,
  updates: UpdateExtensionData
): Promise<Extension> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(updates),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update extension");
  }

  const data = await response.json();
  return data.data.extension;
}

/**
 * Delete an extension
 */
export async function deleteExtension(
  projectId: string,
  extensionId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete extension");
  }
}

/**
 * Toggle extension enabled state
 */
export async function toggleExtension(
  projectId: string,
  extensionId: string
): Promise<Extension> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}/toggle`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to toggle extension");
  }

  const data = await response.json();
  return data.data.extension;
}

/**
 * Reset extensions to defaults
 */
export async function resetExtensionsToDefaults(
  projectId: string
): Promise<Extension[]> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/reset`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to reset extensions");
  }

  const data = await response.json();
  return data.data.extensions;
}

/**
 * Reload extension (clear caches)
 */
export async function reloadExtension(
  projectId: string,
  extensionId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}/reload`,
    { method: "POST", credentials: "include" }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to reload extension");
  }
  return await response.json();
}

/**
 * Get extension health status (error tracking)
 */
export async function getExtensionHealth(
  projectId: string,
  extensionId: string
): Promise<{
  hasError: boolean;
  errorCount?: number;
  lastError?: string;
  lastErrorAt?: number;
}> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}/health`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get extension health");
  }

  return await response.json();
}

/**
 * Get extension debug logs
 */
export async function getExtensionDebugLogs(
  projectId: string,
  extensionId: string
): Promise<Array<{
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source: 'frontend' | 'backend';
  data?: any;
}>> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}/debug`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get debug logs");
  }

  const data = await response.json();
  return data.data.logs || [];
}

/**
 * Toggle extension debug mode
 */
export async function toggleExtensionDebug(
  projectId: string,
  extensionId: string,
  debug: boolean
): Promise<Extension> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}/debug`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ debug }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to toggle debug mode");
  }

  const data = await response.json();
  return data.data.extension;
}

/**
 * Toggle extension source (between default and project)
 */
export async function toggleExtensionSource(
  projectId: string,
  extensionId: string,
  source: 'default' | 'project'
): Promise<{ success: boolean; data: { extensionId: string; source: string; message: string } }> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/extensions/${extensionId}/toggle-source`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ source }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to toggle extension source");
  }

  return await response.json();
}
