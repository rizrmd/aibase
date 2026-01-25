/**
 * Extension Loader Service
 * Handles loading, compiling, and executing project extensions
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ExtensionStorage, type Extension, type ExtensionMetadata } from '../../storage/extension-storage';
import { ProjectStorage } from '../../storage/project-storage';
import { CategoryStorage } from '../../storage/category-storage';
import { extensionHookRegistry } from './extension-hooks';

export class ExtensionLoader {
  private extensionStorage: ExtensionStorage;
  private categoryStorage: CategoryStorage;
  private projectStorage: ProjectStorage;
  private defaultsPath: string;

  constructor() {
    this.extensionStorage = new ExtensionStorage();
    this.categoryStorage = new CategoryStorage();
    this.projectStorage = ProjectStorage.getInstance();
    this.defaultsPath = path.join(__dirname, 'defaults');
  }

  /**
   * Get tenant_id for a project
   */
  private getTenantId(projectId: string): number | string {
    const project = this.projectStorage.getById(projectId);
    return project?.tenant_id ?? 'default';
  }

  /**
   * Initialize extensions for a project by copying defaults if needed
   * @deprecated Extensions are now loaded directly from defaults directory
   */
  async initializeProject(projectId: string): Promise<void> {
    // No-op - extensions are loaded from defaults by default
    // Kept for backwards compatibility
    console.log(`[ExtensionLoader] initializeProject called (no-op, extensions loaded from defaults)`);
  }

  /**
   * Copy default extensions to a project
   */
  private async copyDefaultExtensions(projectId: string): Promise<void> {
    const tenantId = this.getTenantId(projectId);
    try {
      // Read default extensions directory
      const entries = await fs.readdir(this.defaultsPath, { withFileTypes: true });
      const extensionDirs = entries.filter(entry => entry.isDirectory());

      console.log(`[ExtensionLoader] Copying ${extensionDirs.length} default extensions to project ${projectId}`);

      for (const dir of extensionDirs) {
        try {
          const extensionId = dir.name;
          const metadataPath = path.join(this.defaultsPath, extensionId, 'metadata.json');
          const codePath = path.join(this.defaultsPath, extensionId, 'index.ts');

          // Read metadata and code
          const [metadataContent, code] = await Promise.all([
            fs.readFile(metadataPath, 'utf-8'),
            fs.readFile(codePath, 'utf-8'),
          ]);

          const metadata = JSON.parse(metadataContent) as ExtensionMetadata;

          // Create extension in project
          await this.extensionStorage.create(projectId, tenantId, {
            id: metadata.id,
            name: metadata.name,
            description: metadata.description,
            author: metadata.author,
            version: metadata.version,
            category: metadata.category,
            code,
            enabled: metadata.enabled,
            isDefault: true,
          });

          console.log(`[ExtensionLoader] Copied default extension: ${metadata.name}`);
        } catch (error) {
          console.warn(`[ExtensionLoader] Failed to copy extension ${dir.name}:`, error);
        }
      }
    } catch (error) {
      console.error('[ExtensionLoader] Failed to copy default extensions:', error);
      throw error;
    }
  }

  /**
   * Load all enabled extensions for a project and return their exports
   *
   * @param projectId - Project ID
   * @param useProjectExtensions - If true, load project-specific extensions instead of defaults
   */
  async loadExtensions(projectId: string, useProjectExtensions: boolean = false): Promise<Record<string, any>> {
    const tenantId = this.getTenantId(projectId);
    // Get all enabled extensions
    let extensions: Extension[];

    if (useProjectExtensions) {
      // Load project-specific extensions (for future custom extensions)
      console.log(`[ExtensionLoader] Loading project-specific extensions for ${projectId}`);
      extensions = await this.extensionStorage.getEnabled(projectId, tenantId);
    } else {
      // Load directly from defaults directory (default behavior)
      console.log(`[ExtensionLoader] Loading extensions from defaults directory`);
      extensions = await this.loadDefaults();
    }

    if (extensions.length === 0) {
      console.log(`[ExtensionLoader] No enabled extensions for project ${projectId}`);
      return {};
    }

    console.log(`[ExtensionLoader] Loading ${extensions.length} extensions for project ${projectId}`);

    const scope: Record<string, any> = {};

    for (const extension of extensions) {
      try {
        const exports = await this.evaluateExtension(extension);

        // Create a namespace for the extension using its metadata.id
        // Convert kebab-case ID to camelCase for valid JavaScript identifier
        const namespace = extension.metadata.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

        // Add extension under its namespace (e.g., imageDocument, pdfDocument, etc.)
        scope[namespace] = exports;

        console.log(`[ExtensionLoader] Loaded extension '${extension.metadata.name}' as ${namespace} with ${Object.keys(exports).length} exports`);
      } catch (error: any) {
        console.error(`[ExtensionLoader] Failed to load extension '${extension.metadata.name}':`, error);
        // Continue loading other extensions even if one fails
      }
    }

    return scope;
  }

  /**
   * Load extensions directly from defaults directory
   */
  private async loadDefaults(): Promise<Extension[]> {
    try {
      const entries = await fs.readdir(this.defaultsPath, { withFileTypes: true });
      const extensionDirs = entries.filter(entry => entry.isDirectory());

      const extensions: Extension[] = [];

      for (const dir of extensionDirs) {
        try {
          const extensionId = dir.name;
          const metadataPath = path.join(this.defaultsPath, extensionId, 'metadata.json');
          const codePath = path.join(this.defaultsPath, extensionId, 'index.ts');

          // Read metadata and code
          const [metadataContent, code] = await Promise.all([
            fs.readFile(metadataPath, 'utf-8'),
            fs.readFile(codePath, 'utf-8'),
          ]);

          const metadata = JSON.parse(metadataContent) as ExtensionMetadata;

          // Only load enabled extensions
          if (!metadata.enabled) {
            continue;
          }

          extensions.push({
            metadata,
            code,
          });
        } catch (error) {
          console.warn(`[ExtensionLoader] Failed to load default extension ${dir.name}:`, error);
        }
      }

      return extensions;
    } catch (error) {
      console.error('[ExtensionLoader] Failed to load defaults:', error);
      return [];
    }
  }

  /**
   * Evaluate an extension's TypeScript code and return its exports
   */
  private async evaluateExtension(extension: Extension): Promise<Record<string, any>> {
    try {
      // Use Bun's transpiler to compile TypeScript to JavaScript
      const transpiler = new Bun.Transpiler({
        loader: 'ts',
      });

      const jsCode = transpiler.transformSync(extension.code);

      // Wrap code to capture exports and provide globals
      // Extensions should export default an object with their functions
      const wrappedCode = `
        globalThis.extensionHookRegistry = arguments[0];
        ${jsCode}
        return (typeof module !== 'undefined' && module.exports) || {};
      `;

      // Execute in isolated context with hook registry
      const AsyncFunction = (async function () {}).constructor as any;
      const fn = new AsyncFunction(wrappedCode);
      const result = await fn(extensionHookRegistry);

      // Handle different export patterns
      if (result.default) {
        return result.default;
      }

      return result;
    } catch (error: any) {
      console.error(`[ExtensionLoader] Failed to evaluate extension '${extension.metadata.name}':`, error);
      throw new Error(`Extension evaluation failed: ${error.message}`);
    }
  }

  /**
   * Reset extensions for a project (copy defaults again)
   */
  async resetToDefaults(projectId: string): Promise<void> {
    const tenantId = this.getTenantId(projectId);
    // Get all existing extensions
    const existingExtensions = await this.extensionStorage.getAll(projectId, tenantId);

    // Delete all extensions
    for (const ext of existingExtensions) {
      await this.extensionStorage.delete(projectId, ext.metadata.id, tenantId);
    }

    // Reset categories to defaults (recreate categories.json)
    await this.categoryStorage.resetToDefaults(projectId, tenantId);

    // Copy defaults
    await this.copyDefaultExtensions(projectId);
    console.log(`[ExtensionLoader] Reset extensions to defaults for project ${projectId}`);
  }

  /**
   * Get extension storage instance (for API endpoints)
   */
  getStorage(): ExtensionStorage {
    return this.extensionStorage;
  }
}
