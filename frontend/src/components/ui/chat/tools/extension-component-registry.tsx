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

// Type declaration for window.libs
declare global {
  interface Window {
    libs: {
      React: any;
      ReactDOM: any;
      echarts: any;
      ReactECharts: any;
      mermaid: any;
    };
  }
}

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

    // Use new Function to create a module with injected dependencies
    // This is safe because the code comes from our own backend
    // All dependencies are now bundled by esbuild (no external imports)
    try {
      const moduleFactory = new Function(
        `
        "use strict";
        // Module exports object
        const module = { exports: {} };

        // Inject dependencies into window.libs for the code
        if (typeof window !== 'undefined') {
          window.libs = {
            React: React,
            ReactDOM: ReactDOM,
            ReactECharts: ReactECharts,
            echarts: echarts,
            mermaid: mermaid
          };
        }

        // Execute the bundled code
        ${bundledCode}

        // Return the module exports
        return module.exports;
        `
      );

      // Execute with window.libs as arguments
      const moduleExports = moduleFactory(
        window.libs.React,
        window.libs.ReactDOM,
        window.libs.echarts,
        window.libs.ReactECharts,
        window.libs.mermaid
      );

      // Get the named export we need (e.g., ShowChartMessage)
      const messageComponentName = extensionId.split('-').map((part, idx) =>
        idx === 0 ? part.charAt(0).toUpperCase() + part.slice(1) :
        part.charAt(0).toUpperCase() + part.slice(1)
      ).join('') + 'Message';

      const component = moduleExports[messageComponentName] || moduleExports.default;

      if (component) {
        console.log(`[ExtensionRegistry] Successfully loaded backend UI for ${extensionId}:`, messageComponentName);
        return component as ComponentType<VisualizationComponentProps>;
      }

      console.warn(`[ExtensionRegistry] No component found in module for ${extensionId}. Looked for:`, messageComponentName, 'Available:', Object.keys(moduleExports));
      return null;
    } catch (error) {
      console.error(`[ExtensionRegistry] Error loading module with Function:`, error);
      return null;
    }
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
