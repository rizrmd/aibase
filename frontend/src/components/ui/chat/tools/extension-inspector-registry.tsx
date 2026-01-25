/**
 * Extension Inspector Registry
 * Registry for extension-specific inspector components
 *
 * Extensions can register inspector components that display
 * detailed information in the script details dialog
 */

import { ComponentType } from "react";

export interface InspectorComponentProps {
  data: any;
  error?: string;
}

// Registry of extension-defined inspector components
const inspectorComponents: Record<string, ComponentType<InspectorComponentProps>> = {};

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
 * @param extensionId - The extension ID
 * @returns The component or null if not found
 */
export function getInspector(
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
