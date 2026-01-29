/**
 * Extension Inspector Registry
 * Registry for extension-specific inspector components
 *
 * Extensions can register inspector components that display
 * detailed information in the script details dialog
 */

import type { ComponentType } from "react";
import { loadExtensionDependencies } from "@/lib/extension-dependency-loader";

export interface InspectorComponentProps {
  data: any;
  error?: string;
}

// Registry of extension-defined inspector components
const inspectorComponents: Record<string, ComponentType<InspectorComponentProps>> = {};

// Cache for dynamically loaded inspector components
const inspectorCache: Record<string, ComponentType<InspectorComponentProps>> = {};

/**
 * Register an extension's inspector component
 * @param extensionId - The extension ID (e.g., 'postgresql', 'duckdb')
 * @param component - The React component to render for inspection
 */
export function registerInspector(
  extensionId: string,
  component: ComponentType<InspectorComponentProps>
): void {
  inspectorComponents[extensionId] = component;
  console.log(`[ExtensionInspectorRegistry] Registered inspector for extension: ${extensionId}`);
}

/**
 * Get an inspector component by extension ID
 * First checks registry, then tries to load from API
 * @param extensionId - The extension ID
 * @returns The component or null if not found
 */
export async function getInspector(
  extensionId: string,
  projectId?: string,
  tenantId?: string | number
): Promise<ComponentType<InspectorComponentProps> | null> {
  // Check registry first (hardcoded inspectors)
  if (inspectorComponents[extensionId]) {
    return inspectorComponents[extensionId];
  }

  // Check cache
  const cacheKey = projectId ? `${extensionId}-${projectId}` : extensionId;
  if (inspectorCache[cacheKey]) {
    return inspectorCache[cacheKey];
  }

  // Load dependencies first (if any)
  try {
    const tenantParam = tenantId !== undefined ? String(tenantId) : undefined;
    await loadExtensionDependencies(extensionId, projectId, tenantParam);
  } catch (error) {
    console.warn(`[ExtensionInspectorRegistry] Failed to load dependencies for ${extensionId}:`, error);
    // Continue anyway - dependencies might be optional
  }

  // Try to load from API
  try {
    const component = await loadInspectorFromAPI(extensionId, projectId, tenantId);
    if (component) {
      inspectorCache[cacheKey] = component;
      return component;
    }
  } catch (error) {
    console.warn(`[ExtensionInspectorRegistry] Failed to load inspector for ${extensionId}:`, error);
  }

  return null;
}

/**
 * Load inspector component from backend API
 * @param extensionId - The extension ID
 * @returns The component or null if not found
 */
async function loadInspectorFromAPI(
  extensionId: string,
  projectId?: string,
  tenantId?: string | number
): Promise<ComponentType<InspectorComponentProps> | null> {
  try {
    console.log(`[ExtensionInspectorRegistry] Loading inspector for ${extensionId} from API`);

    // Fetch bundled UI from backend
    const url = new URL(`/api/extensions/${extensionId}/ui`, window.location.origin);
    if (projectId && tenantId !== undefined) {
      url.searchParams.set('projectId', projectId);
      url.searchParams.set('tenantId', String(tenantId));
    }
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.warn(`[ExtensionInspectorRegistry] API returned ${response.status} for ${extensionId}`);
      return null;
    }

    const bundledCode = await response.text();

    // Create module from code
    const blob = new Blob([bundledCode], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    // Dynamic import
    const module = await import(/* @vite-ignore */ blobUrl);

    // Clean up blob URL
    URL.revokeObjectURL(blobUrl);

    // Get default export or named export
    const component = module.default || module.PostgreSQLInspector || module[Object.keys(module)[0]];

    if (component) {
      console.log(`[ExtensionInspectorRegistry] Successfully loaded inspector for ${extensionId}`);
      return component as ComponentType<InspectorComponentProps>;
    }

    return null;
  } catch (error) {
    console.error(`[ExtensionInspectorRegistry] Error loading inspector for ${extensionId}:`, error);
    return null;
  }
}

/**
 * Synchronous version of getInspector for backward compatibility
 * @deprecated Use async version instead
 * @param extensionId - The extension ID
 * @returns The component or null if not found
 */
export function getInspectorSync(
  extensionId: string
): ComponentType<InspectorComponentProps> | null {
  return inspectorComponents[extensionId] || null;
}

/**
 * Check if an extension has a registered inspector
 * @param extensionId - The extension ID
 * @returns true if the extension has a registered inspector
 */
export function hasInspector(extensionId: string): boolean {
  return inspectorComponents[extensionId] !== undefined;
}

/**
 * Get all registered inspector extension IDs
 */
export function getRegisteredInspectors(): string[] {
  return Object.keys(inspectorComponents);
}

/**
 * Clear inspector cache (useful for testing/development)
 */
export function clearInspectorCache(): void {
  Object.keys(inspectorCache).forEach(key => {
    delete inspectorCache[key];
  });
  console.log('[ExtensionInspectorRegistry] Inspector cache cleared');
}
