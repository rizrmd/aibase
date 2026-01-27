/**
 * Extension Component Registry
 * Dynamic registry for extension-defined UI components
 *
 * All components are loaded from backend API:
 * - Default UI: /api/extensions/:id/ui
 * - Project-specific UI: /api/extensions/:id/ui?projectId=xxx&tenantId=xxx
 */

import type { ComponentType } from "react";
import type { ToolInvocation } from "./types";

export interface VisualizationComponentProps {
  toolInvocation: ToolInvocation;
}

// Registry of extension-defined components (loaded from backend)
const backendComponents: Record<string, ComponentType<VisualizationComponentProps>> = {};

// Cache for dynamically loaded backend components
const backendComponentCache: Record<string, ComponentType<VisualizationComponentProps>> = {};

/**
 * Register an extension's component (loaded from backend)
 * @param type - The extension type (e.g., 'show-chart', 'custom-viz')
 * @param component - The React component to render
 */
export function registerExtensionComponent(
  type: string,
  component: ComponentType<VisualizationComponentProps>
): void {
  backendComponents[type] = component;
  console.log(`[ExtensionRegistry] Registered backend component for: ${type}`);
}

/**
 * Load component from backend API
 * @param extensionId - The extension ID
 * @param projectId - Optional project ID for project-specific UI
 * @param tenantId - Optional tenant ID for project-specific UI
 * @returns The component or null if not found
 */
async function loadComponentFromBackend(
  extensionId: string,
  projectId?: string,
  tenantId?: string
): Promise<ComponentType<VisualizationComponentProps> | null> {
  try {
    console.log(`[ExtensionRegistry] Loading ${extensionId} from backend API${projectId ? ` (project: ${projectId})` : ''}`);

    // Build URL with optional query params for project-specific UI
    const url = new URL(`/api/extensions/${extensionId}/ui`, window.location.origin);
    if (projectId && tenantId) {
      url.searchParams.set('projectId', projectId);
      url.searchParams.set('tenantId', tenantId);
    }

    // Fetch bundled UI from backend
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.log(`[ExtensionRegistry] Backend UI not available for ${extensionId}`);
      return null;
    }

    const bundledCode = await response.text();

    // Create module from code
    const blob = new Blob([bundledCode], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    // Dynamic import
    const module = await import(blobUrl);

    // Clean up blob URL after a short delay to ensure module is loaded
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

    // Get named export (ShowChartMessage, ShowTableMessage, ShowMermaidMessage, etc.)
    const messageComponentName = extensionId.split('-').map((part, idx) =>
      idx === 0 ? part.charAt(0).toUpperCase() + part.slice(1) :
      part.charAt(0).toUpperCase() + part.slice(1)
    ).join('') + 'Message';

    console.log(`[ExtensionRegistry] Looking for component: ${messageComponentName}`);
    console.log(`[ExtensionRegistry] Module exports:`, Object.keys(module));
    console.log(`[ExtensionRegistry] Has named export?`, !!module[messageComponentName]);
    console.log(`[ExtensionRegistry] Has default export?`, !!module.default);

    const component = module[messageComponentName] || module.default || Object.values(module)[0];

    if (component) {
      console.log(`[ExtensionRegistry] Successfully loaded backend UI for ${extensionId}`);
      return component as ComponentType<VisualizationComponentProps>;
    }

    console.warn(`[ExtensionRegistry] No component found in module for ${extensionId}`);
    return null;
  } catch (error) {
    console.warn(`[ExtensionRegistry] Failed to load backend UI for ${extensionId}:`, error);
    return null;
  }
}

/**
 * Get a visualization component by type
 * Loads from backend API with optional project context
 *
 * Priority:
 * 1. Backend registry (hardcoded components)
 * 2. Backend cache (previously loaded)
 * 3. Backend API (fresh load with project context)
 *
 * @param type - The visualization type
 * @param projectId - Optional project ID for project-specific UI
 * @param tenantId - Optional tenant ID for project-specific UI
 * @returns The component or null if not found
 */
export async function getExtensionComponent(
  type: string,
  projectId?: string,
  tenantId?: string
): Promise<ComponentType<VisualizationComponentProps> | null> {
  // Check backend registry first (hardcoded backend components)
  if (backendComponents[type]) {
    return backendComponents[type];
  }

  // Check backend cache
  const cacheKey = projectId ? `${type}-${projectId}` : type;
  if (backendComponentCache[cacheKey]) {
    return backendComponentCache[cacheKey];
  }

  // Try to load from backend API (with project context)
  const backendComponent = await loadComponentFromBackend(type, projectId, tenantId);
  if (backendComponent) {
    backendComponentCache[cacheKey] = backendComponent;
    return backendComponent;
  }

  console.warn(`[ExtensionRegistry] No UI component found for ${type}`);
  return null;
}

/**
 * Synchronous version for backward compatibility
 * Only returns registry components (no API calls)
 * @deprecated Use async version instead
 */
export function getExtensionComponentSync(
  type: string
): ComponentType<VisualizationComponentProps> | null {
  return backendComponents[type] || null;
}

/**
 * Check if a visualization type is supported
 * @param type - The visualization type
 * @returns true if the type has a registered component
 */
export function hasVisualizationType(type: string): boolean {
  return (
    backendComponents[type] !== undefined ||
    Object.keys(backendComponentCache).some(key => key.startsWith(type))
  );
}

/**
 * Get all registered visualization types
 */
export function getRegisteredTypes(): string[] {
  return [
    ...Object.keys(backendComponents),
    ...Object.keys(backendComponentCache).map(key => key.split('-')[0])
  ];
}

/**
 * Clear backend component cache (useful for development/hot-reload)
 */
export function clearBackendComponentCache(): void {
  Object.keys(backendComponentCache).forEach(key => {
    delete backendComponentCache[key];
  });
  console.log('[ExtensionRegistry] Backend component cache cleared');
}

/**
 * Clear cache for a specific extension component
 * @param extensionId - Extension ID
 * @param projectId - Optional project ID for project-specific extensions
 */
export function clearExtensionComponentCache(
  extensionId: string,
  projectId?: string
): void {
  const cacheKey = projectId ? `${extensionId}-${projectId}` : extensionId;
  if (backendComponentCache[cacheKey]) {
    delete backendComponentCache[cacheKey];
    console.log(`[ExtensionRegistry] Cleared cache for ${extensionId}${projectId ? ` (project: ${projectId})` : ''}`);
  }
}
