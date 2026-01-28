/**
 * Extension Dependency Loader
 *
 * Loads dynamic npm package dependencies for extension UI components.
 * All dependencies are bundled and served from your own backend - no external CDN requests.
 */

interface ExtensionMetadata {
  id: string;
  name: string;
  dependencies?: {
    frontend?: Record<string, string>; // Package -> version
  };
}

const loadedDependencies = new Map<string, string>(); // packageName -> version
const loadingPromises = new Map<string, Promise<void>>();

/**
 * Load extension dependencies from backend
 *
 * @param extensionId - Extension identifier
 * @param projectId - Optional project ID for project-specific extensions
 * @param tenantId - Optional tenant ID
 * @returns Promise that resolves when dependencies are loaded
 */
export async function loadExtensionDependencies(
  extensionId: string,
  projectId?: string,
  tenantId?: string
): Promise<void> {
  try {
    // Build URL for metadata endpoint
    const url = new URL(`/api/extensions/${extensionId}/metadata`, window.location.origin);
    if (projectId && tenantId) {
      url.searchParams.set('projectId', projectId);
      url.searchParams.set('tenantId', tenantId);
    }

    // Fetch extension metadata
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn(`[ExtensionDeps] Failed to fetch metadata for ${extensionId}:`, response.statusText);
      return;
    }

    const result = await response.json();
    if (!result.success || !result.data) {
      console.warn(`[ExtensionDeps] Invalid metadata response for ${extensionId}`);
      return;
    }

    const metadata: ExtensionMetadata = result.data;
    const deps = metadata.dependencies?.frontend;

    if (!deps || Object.keys(deps).length === 0) {
      console.log(`[ExtensionDeps] No frontend dependencies for ${extensionId}`);
      return;
    }

    // Check which dependencies are already loaded
    const newDeps: Record<string, string> = {};
    for (const [name, version] of Object.entries(deps)) {
      const loadedVersion = loadedDependencies.get(name);
      if (loadedVersion !== version) {
        newDeps[name] = version;
      }
    }

    if (Object.keys(newDeps).length === 0) {
      console.log(`[ExtensionDeps] All dependencies already loaded for ${extensionId}`);
      return;
    }

    console.log(`[ExtensionDeps] Loading ${Object.keys(newDeps).length} new dependencies for ${extensionId}:`, Object.keys(newDeps));

    // Create a unique loading key for this request
    const loadingKey = JSON.stringify({ extensionId, deps: newDeps });

    // Check if already loading
    if (loadingPromises.has(loadingKey)) {
      console.log(`[ExtensionDeps] Dependencies already loading for ${extensionId}, waiting...`);
      return loadingPromises.get(loadingKey);
    }

    // Load dependencies
    const loadingPromise = loadDependenciesFromBackend(newDeps, extensionId);
    loadingPromises.set(loadingKey, loadingPromise);

    try {
      await loadingPromise;
      console.log(`[ExtensionDeps] Successfully loaded dependencies for ${extensionId}`);
    } finally {
      loadingPromises.delete(loadingKey);
    }

  } catch (error) {
    console.error(`[ExtensionDeps] Failed to load dependencies for ${extensionId}:`, error);
    throw error;
  }
}

/**
 * Load dependencies from backend bundle endpoint
 */
async function loadDependenciesFromBackend(
  dependencies: Record<string, string>,
  extensionId: string
): Promise<void> {
  try {
    // Request bundled dependencies from backend
    const response = await fetch('/api/extensions/dependencies/bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependencies })
    });

    if (!response.ok) {
      throw new Error(`Failed to bundle dependencies: ${response.statusText}`);
    }

    // Get bundled code
    const bundleCode = await response.text();

    // Execute the bundled code
    const blob = new Blob([bundleCode], { type: 'application/javascript' });
    const bundleUrl = URL.createObjectURL(blob);

    try {
      // Import the bundled module
      await import(bundleUrl);

      // Mark as loaded
      for (const [name, version] of Object.entries(dependencies)) {
        loadedDependencies.set(name, version);
      }

      console.log(`[ExtensionDeps] Loaded and executed bundle for ${extensionId}`);
    } finally {
      URL.revokeObjectURL(bundleUrl);
    }

  } catch (error) {
    console.error(`[ExtensionDeps] Error loading bundle:`, error);
    throw error;
  }
}

/**
 * Check if a dependency is loaded
 */
export function hasDependency(name: string): boolean {
  return loadedDependencies.has(name);
}

/**
 * Get loaded dependency version
 */
export function getDependencyVersion(name: string): string | undefined {
  return loadedDependencies.get(name);
}

/**
 * Get all loaded dependencies
 */
export function getLoadedDependencies(): Map<string, string> {
  return new Map(loadedDependencies);
}

/**
 * Clear loaded dependencies (useful for testing/hot-reload)
 */
export function clearLoadedDependencies(): void {
  loadedDependencies.clear();
  loadingPromises.clear();
  console.log('[ExtensionDeps] Cleared all loaded dependencies');
}

/**
 * Expose a helper to access window.libs safely
 */
export function getLibs(): any {
  if (typeof window === 'undefined') {
    return {};
  }
  return (window as any).libs || {};
}

/**
 * Check if a library is available in window.libs
 */
export function hasLib(name: string): boolean {
  const libs = getLibs();
  return !!libs[name];
}
