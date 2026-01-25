/**
 * Extension Component Registry
 * Dynamic registry for extension-defined UI components
 *
 * Extensions can register their own visualization components
 * that will be rendered in the chat when __visualizations are returned
 */

import { lazy } from "react";
import type { ComponentType } from "react";
import type { ToolInvocation } from "./types";

export interface VisualizationComponentProps {
  toolInvocation: ToolInvocation;
}

// Registry of extension-defined UI components
const extensionComponents: Record<string, ComponentType<VisualizationComponentProps>> = {};

// Built-in visualization components - lazy loaded
const builtInComponents: Record<string, () => Promise<{ default: ComponentType<any> }>> = {
  'show-chart': () => import("./chart-tool").then(m => ({ default: m.ChartTool })),
  'show-table': () => import("./table-tool").then(m => ({ default: m.TableTool })),
  'show-mermaid': () => import("./mermaid-tool").then(m => ({ default: m.MermaidTool })),
};

/**
 * Register an extension's visualization component
 * @param type - The visualization type (e.g., 'show-chart', 'custom-viz')
 * @param component - The React component to render
 */
export function registerExtensionComponent(
  type: string,
  component: ComponentType<VisualizationComponentProps>
): void {
  extensionComponents[type] = component;
  console.log(`[ExtensionRegistry] Registered component for type: ${type}`);
}

/**
 * Get a visualization component by type
 * @param type - The visualization type
 * @returns The component or null if not found
 */
export function getExtensionComponent(
  type: string
): ComponentType<VisualizationComponentProps> | null {
  // Check extension-registered components first
  if (extensionComponents[type]) {
    return extensionComponents[type];
  }

  // Check built-in components
  if (builtInComponents[type]) {
    // Create a lazy wrapper for built-in components
    const LazyComponent = lazy(builtInComponents[type]);
    return LazyComponent as ComponentType<VisualizationComponentProps>;
  }

  return null;
}

/**
 * Check if a visualization type is supported
 * @param type - The visualization type
 * @returns true if the type has a registered component
 */
export function hasVisualizationType(type: string): boolean {
  return extensionComponents[type] !== undefined || builtInComponents[type] !== undefined;
}

/**
 * Get all registered visualization types
 */
export function getRegisteredTypes(): string[] {
  return [
    ...Object.keys(extensionComponents),
    ...Object.keys(builtInComponents)
  ];
}
