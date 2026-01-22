/**
 * Extension Loader Service
 * Handles loading, compiling, and executing project extensions
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ExtensionStorage, type Extension, type ExtensionMetadata } from '../../storage/extension-storage';

export class ExtensionLoader {
  private extensionStorage: ExtensionStorage;
  private defaultsPath: string;

  constructor() {
    this.extensionStorage = new ExtensionStorage();
    this.defaultsPath = path.join(__dirname, 'defaults');
  }

  /**
   * Initialize extensions for a project by copying defaults if needed
   */
  async initializeProject(projectId: string): Promise<void> {
    await this.extensionStorage.ensureExtensionsDir(projectId);

    // Check if defaults have already been copied
    const existingExtensions = await this.extensionStorage.getAll(projectId);

    // If project already has extensions, don't overwrite
    if (existingExtensions.length > 0) {
      console.log(`[ExtensionLoader] Project ${projectId} already has ${existingExtensions.length} extensions`);
      return;
    }

    // Copy default extensions
    await this.copyDefaultExtensions(projectId);
  }

  /**
   * Copy default extensions to a project
   */
  private async copyDefaultExtensions(projectId: string): Promise<void> {
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
          await this.extensionStorage.create(projectId, {
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
   */
  async loadExtensions(projectId: string): Promise<Record<string, any>> {
    // Initialize project extensions if needed
    await this.initializeProject(projectId);

    // Get all enabled extensions
    const extensions = await this.extensionStorage.getEnabled(projectId);

    if (extensions.length === 0) {
      console.log(`[ExtensionLoader] No enabled extensions for project ${projectId}`);
      return {};
    }

    console.log(`[ExtensionLoader] Loading ${extensions.length} extensions for project ${projectId}`);

    const scope: Record<string, any> = {};

    for (const extension of extensions) {
      try {
        const exports = await this.evaluateExtension(extension);

        // Merge extension exports into scope
        Object.assign(scope, exports);

        console.log(`[ExtensionLoader] Loaded extension '${extension.metadata.name}' with ${Object.keys(exports).length} exports`);
      } catch (error: any) {
        console.error(`[ExtensionLoader] Failed to load extension '${extension.metadata.name}':`, error);
        // Continue loading other extensions even if one fails
      }
    }

    return scope;
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

      // Wrap code to capture exports
      // Extensions should export default an object with their functions
      const wrappedCode = `
        ${jsCode}
        return (typeof module !== 'undefined' && module.exports) || {};
      `;

      // Execute in isolated context
      const AsyncFunction = (async function () {}).constructor as any;
      const fn = new AsyncFunction(wrappedCode);
      const result = await fn();

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
    // Get all existing extensions
    const existingExtensions = await this.extensionStorage.getAll(projectId);

    // Delete all extensions
    for (const ext of existingExtensions) {
      await this.extensionStorage.delete(projectId, ext.metadata.id);
    }

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
