/**
 * Extension Loader Service
 * Handles loading, compiling, and executing project extensions
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as esbuild from 'esbuild';
import { ExtensionStorage, type Extension, type ExtensionMetadata } from '../../storage/extension-storage';
import { ProjectStorage } from '../../storage/project-storage';
import { CategoryStorage } from '../../storage/category-storage';
import { extensionHookRegistry } from './extension-hooks';
import { dependencyBundler } from './dependency-bundler';
import type { DependencyRequest } from './dependency-bundler';
import * as os from 'os';

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
   *
   * This copies extensions from backend/src/tools/extensions/defaults/ to data/{projectId}/extensions/
   * Only runs if the project doesn't have extensions yet
   */
  async initializeProject(projectId: string): Promise<void> {
    const tenantId = this.getTenantId(projectId);

    // Check if USE_DEFAULT_EXTENSIONS is enabled
    // If true, we don't need to copy - extensions load directly from backend folder
    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    if (useDefaults) {
      return;
    }

    // Ensure project extensions directory exists
    await this.extensionStorage.ensureExtensionsDir(projectId, tenantId);

    // Check if defaults have already been copied
    const existingExtensions = await this.extensionStorage.getAll(projectId, tenantId);

    // If project already has extensions, don't overwrite
    if (existingExtensions.length > 0) {
      return;
    }

    // Copy default extensions to project folder
    await this.copyDefaultExtensions(projectId);
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
   * Behavior controlled by USE_DEFAULT_EXTENSIONS environment variable:
   * - true: Load from backend/src/tools/extensions/defaults/ with project overrides (development mode)
   * - false: Load from data/{projectId}/extensions/ (production mode, per-project customization)
   *
   * @param projectId - Project ID
   */
  async loadExtensions(projectId: string): Promise<Record<string, any>> {
    const tenantId = this.getTenantId(projectId);
    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    // Get all enabled extensions
    let extensions: Extension[];

    if (useDefaults) {
      // Development mode: Load from defaults directory with project overrides
      // Project extensions override defaults with the same ID
      const [defaultExts, projectExts] = await Promise.all([
        this.loadDefaults(),
        this.extensionStorage.getAll(projectId, tenantId)
      ]);

      // Create map of project extensions for fast lookup
      const projectMap = new Map(projectExts.map(p => [p.metadata.id, p]));

      // Start with defaults, override with project versions
      extensions = defaultExts.map(d => {
        const override = projectMap.get(d.metadata.id);
        if (override) {
          return override;
        }
        return d;
      });

      // Add project-only extensions (not in defaults)
      const defaultIds = new Set(defaultExts.map(d => d.metadata.id));
      const projectOnly = projectExts.filter(p => !defaultIds.has(p.metadata.id));
      extensions.push(...projectOnly);
    } else {
      // Production mode: Load from project's extensions folder
      // Each project can have different extension versions
      extensions = await this.extensionStorage.getEnabled(projectId, tenantId);
    }

    if (extensions.length === 0) {
      return {};
    }

    const scope: Record<string, any> = {};

    for (const extension of extensions) {
      try {
        const exports = await this.evaluateExtension(extension);

        // Clear error status on successful load
        const tenantId = this.getTenantId(projectId);
        await this.extensionStorage.clearError(projectId, extension.metadata.id, tenantId);

        // Create a namespace for the extension using its metadata.id
        // Strategy: Use one-word namespace when possible, but use full camelCase for:
        // 1. Multi-word extensions where first word is a common prefix (show-chart → showChart)
        // 2. Single-key exports (postgresql → postgresql)
        // Always use camelCase (first letter lowercase) for valid JavaScript identifiers
        const fullNamespace = extension.metadata.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const functionNames = Object.keys(exports);

        // Convert to camelCase (first letter lowercase)
        const toCamelCase = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

        // Determine namespace based on extension structure
        let namespace: string;
        if (functionNames.length === 1) {
          // Single-key export: use the key name as namespace (postgresql → postgresql)
          // But if the key doesn't match the ID, use full camelCase
          const exportKey = functionNames[0];
          const expectedKey = toCamelCase(fullNamespace);
          if (exportKey === expectedKey || exportKey.toLowerCase() === fullNamespace.toLowerCase()) {
            namespace = exportKey;
          } else {
            namespace = toCamelCase(fullNamespace);
          }
        } else {
          // Multi-key export: use one-word namespace for descriptive IDs (excel-document → excel)
          // But use full camelCase for common prefixes (show-chart → showChart)
          const firstWord = fullNamespace.split(/(?=[A-Z])/)[0].toLowerCase();
          const commonPrefixes = ['show', 'web', 'image', 'pdf', 'word', 'powerpoint', 'extension'];

          if (commonPrefixes.includes(firstWord) && fullNamespace !== firstWord) {
            namespace = toCamelCase(fullNamespace); // Use full camelCase (showChart, webSearch, etc.)
          } else {
            namespace = firstWord; // Use one-word namespace (excel, postgresql, etc.)
          }
        }

        // Always use namespace to avoid conflicts - never flatten to top level
        // This ensures consistent calling patterns: excel.summarize(), postgresql(), etc.
        scope[namespace] = exports;
      } catch (error: any) {
        console.error(`[ExtensionLoader] Failed to load extension '${extension.metadata.name}':`, error);

        // Record error in metadata
        const tenantId = this.getTenantId(projectId);
        await this.extensionStorage.recordError(projectId, extension.metadata.id, tenantId, error);

        // Add debug log if debug mode is enabled
        if (extension.metadata.debug) {
          await this.extensionStorage.addDebugLog(
            projectId,
            extension.metadata.id,
            tenantId,
            'error',
            `Failed to load extension: ${error instanceof Error ? error.message : String(error)}`,
            { stack: error instanceof Error ? error.stack : undefined }
          );
        }

        // Continue loading other extensions even if one fails
      }
    }

    console.log(`[ExtensionLoader] Loaded ${Object.keys(scope).length} tools from ${extensions.length} extensions`);
    return scope;
  }

  /**
   * Load extensions directly from defaults directory
   */
  async loadDefaults(): Promise<Extension[]> {
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
   * Transpile TypeScript to JavaScript using esbuild
   *
   * Extensions use top-level return to export their API, which is not valid in ES modules.
   * We work around this by converting the top-level return to a variable assignment before transpiling.
   */
  async transpileExtension(code: string, extensionId: string): Promise<string> {
    try {
      // Convert top-level return to a variable assignment
      // This allows esbuild to transpile the code without ESM errors
      let transformedCode = code;

      // Check if code has a top-level return statement
      // Extensions use a specific pattern: // @ts-expect-error comment followed by return
      // We need to match ONLY the top-level return, not returns inside functions
      //
      // Strategy: Look for return statements that come after the @ts-expect-error comment
      // OR are at the end of the file (last 5 lines) to avoid matching function returns
      const lines = code.split('\n');
      let converted = false;
      let convertedLine = -1;

      // Method 1: Look for @ts-expect-error pattern
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].includes('@ts-expect-error') && lines[i].includes('Extension loader wraps')) {
          const nextLine = lines[i + 1];
          const returnMatch = nextLine.match(/^\s*return\s+(.+)/);
          if (returnMatch) {
            lines[i + 1] = nextLine.replace(/^\s*return\s+(.+)/, 'module.exports = $1');
            converted = true;
            convertedLine = i + 1;
            break;
          }
        }
      }

      // Method 2: If no @ts-expect-error pattern, look for return in last 5 lines
      if (!converted && lines.length > 5) {
        const lastLines = lines.slice(-5);
        for (let i = 0; i < lastLines.length; i++) {
          const returnMatch = lastLines[i].match(/^\s*return\s+(.+)/);
          if (returnMatch) {
            const actualIndex = lines.length - 5 + i;
            lines[actualIndex] = lastLines[i].replace(/^\s*return\s+(.+)/, 'module.exports = $1');
            converted = true;
            convertedLine = actualIndex;
            break;
          }
        }
      }

      if (converted) {
        transformedCode = lines.join('\n');
      }

      const result = await esbuild.transform(transformedCode, {
        loader: 'ts',
        target: 'esnext',
        format: 'cjs',
        minify: false,
        supported: {
          // Allow top-level await
          'top-level-await': true,
          // Allow dynamic import
          'dynamic-import': true,
        },
      });

      // Check if transpilation actually changed anything
      if (result.code === transformedCode) {
        console.error(`[ExtensionLoader] WARNING: Transpiled code is IDENTICAL to input! esbuild didn't transpile.`);
      }

      return result.code;
    } catch (error) {
      console.error(`[ExtensionLoader] Transpilation FAILED for '${extensionId}':`, error);
      console.error(`[ExtensionLoader] Error details:`, error);
      // Throw error instead of returning original code - we can't evaluate raw TypeScript
      throw new Error(`Failed to transpile extension '${extensionId}': ${error}`);
    }
  }

  /**
   * Evaluate an extension's TypeScript code directly in the main thread
   *
   * Note: We don't use worker threads because postMessage cannot clone functions.
   * Extensions export functions that need to be callable from the main thread.
   */
  private async evaluateExtension(extension: Extension): Promise<Record<string, any>> {
    try {
      // Transpile TypeScript to JavaScript
      const jsCode = await this.transpileExtension(extension.code, extension.metadata.id);

      // Load backend dependencies if declared
      const backendDeps = extension.metadata.dependencies?.backend || {};

      // Load dependencies
      const loadedDeps: Record<string, any> = {};
      for (const [name, version] of Object.entries(backendDeps)) {
        try {
          loadedDeps[name] = await import(name);
        } catch (error) {
          console.error(`[ExtensionLoader] Failed to load dependency ${name}:`, error);
          throw new Error(`Failed to load dependency ${name}: ${error}`);
        }
      }

      // Create dependency object string
      const depsObjectString = Object.keys(loadedDeps).length > 0
        ? `const deps = ${JSON.stringify(Object.keys(loadedDeps).reduce((acc, key) => {
            const safeKey = key.includes('-') ? `"${key}"` : key;
            acc[safeKey] = `__deps[${JSON.stringify(key)}]`;
            return acc;
          }, {} as Record<string, string>))};`
        : 'const deps = {};';

      // Wrap code to capture exports
      const wrappedCode = `
        "use strict";
        const module = { exports: {} };

        // Inject dependencies
        const __deps = arguments[1] || {};
        ${depsObjectString}

        // Extension hook registry placeholder
        globalThis.extensionHookRegistry = arguments[0];

        // Get require from arguments (passed as third parameter)
        const require = arguments[2];

        // Get common utilities from arguments (passed as fourth parameter)
        const utils = arguments[3] || {};

        // Execute extension code (already transpiled to JavaScript)
        let extensionResult;
        let errorMsg;
        try {
          const getExtensionExports = () => {
            ${jsCode}
          };

          extensionResult = getExtensionExports();
        } catch (e) {
          errorMsg = e instanceof Error ? e.message : String(e);
          throw e;
        }

        // Check for module.exports pattern
        const moduleExportsKeys = Object.keys(module.exports);
        if (moduleExportsKeys.length > 0) {
          return module.exports;
        }

        return extensionResult || {};
      `;

      // Execute in controlled environment
      const AsyncFunction = (async function () {}).constructor as any;
      const fn = new AsyncFunction(wrappedCode);

      // Import the real extensionHookRegistry singleton
      const { extensionHookRegistry } = await import('../extensions/extension-hooks');

      // Import common utilities
      const { generateTitle } = await import('../../utils/title-generator');

      // Common utilities object to inject into extensions
      const commonUtils = {
        generateTitle,
      };

      // Evaluate the extension (pass hook registry, deps, require, and utils)
      const result = await fn(extensionHookRegistry, loadedDeps, require, commonUtils);

      return result || {};
    } catch (error: any) {
      console.error(`[ExtensionLoader] Failed to evaluate extension '${extension.metadata.name}':`, error);
      throw new Error(`Extension evaluation failed: ${error.message}`);
    }
  }

  /**
   * Safely extract context from an extension by evaluating its context() function
   *
   * SECURITY CONSIDERATIONS:
   * - Extensions are already executed during script tool usage, so this doesn't introduce new attack surface
   * - Context function should only return static strings, but we guard against malicious implementations
   * - Added timeout to prevent DoS via infinite loops
   * - Catch all errors to prevent extension bugs from breaking context generation
   *
   * @param extension - Extension to extract context from
   * @param timeoutMs - Maximum time to allow context function to run (default: 5 seconds)
   * @returns Context string, or empty string if evaluation fails
   */
  async extractExtensionContext(extension: Extension, timeoutMs: number = 5000): Promise<string> {
    try {
      console.log(`[ExtensionLoader] Evaluating context for extension '${extension.metadata.id}'`);

      // Wrap evaluation in timeout
      const contextPromise = this.evaluateExtension(extension);

      // Race between evaluation and timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Context evaluation timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      const exports = await Promise.race([contextPromise, timeoutPromise]);

      // Check if context function exists and is callable
      if (exports.context && typeof exports.context === 'function') {
        // Execute context function with timeout
        const contextResultPromise = Promise.resolve(exports.context());

        const contextTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Context function timeout after ${timeoutMs}ms`)), timeoutMs);
        });

        const contextString = await Promise.race([contextResultPromise, contextTimeoutPromise]);

        if (typeof contextString === 'string') {
          console.log(`[ExtensionLoader] Successfully evaluated context for '${extension.metadata.id}' (${contextString.length} chars)`);
          return contextString;
        } else {
          console.warn(`[ExtensionLoader] Context function for '${extension.metadata.id}' did not return a string, got ${typeof contextString}`);
          return '';
        }
      } else {
        console.log(`[ExtensionLoader] Extension '${extension.metadata.id}' has no context function, will use regex fallback`);
        return '';
      }
    } catch (error: any) {
      // Log error but don't fail - caller will fall back to regex parsing
      console.warn(`[ExtensionLoader] Failed to evaluate context for '${extension.metadata.id}': ${error.message}`);
      return '';
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
  }

  /**
   * Get extension storage instance (for API endpoints)
   */
  getStorage(): ExtensionStorage {
    return this.extensionStorage;
  }

  /**
   * Get extension source status
   * Returns information about which extensions have project versions
   */
  async getExtensionSourceStatus(projectId: string): Promise<Map<string, { hasDefault: boolean; hasProject: boolean; currentSource: 'default' | 'project' }>> {
    const tenantId = this.getTenantId(projectId);
    const useDefaults = process.env.USE_DEFAULT_EXTENSIONS === 'true';

    const status = new Map<string, { hasDefault: boolean; hasProject: boolean; currentSource: 'default' | 'project' }>();

    if (useDefaults) {
      // In dev mode, check both sources
      const [defaultExts, projectExts] = await Promise.all([
        this.loadDefaults(),
        this.extensionStorage.getAll(projectId, tenantId)
      ]);

      const projectMap = new Map(projectExts.map(p => [p.metadata.id, p]));

      // Add all defaults
      for (const def of defaultExts) {
        const hasProject = projectMap.has(def.metadata.id);
        status.set(def.metadata.id, {
          hasDefault: true,
          hasProject: hasProject,
          currentSource: hasProject ? 'project' : 'default'
        });
      }

      // Add project-only extensions
      const defaultIds = new Set(defaultExts.map(d => d.metadata.id));
      for (const proj of projectExts) {
        if (!defaultIds.has(proj.metadata.id)) {
          status.set(proj.metadata.id, {
            hasDefault: false,
            hasProject: true,
            currentSource: 'project'
          });
        }
      }
    } else {
      // In prod mode, only project extensions exist
      const projectExts = await this.extensionStorage.getAll(projectId, tenantId);
      for (const proj of projectExts) {
        status.set(proj.metadata.id, {
          hasDefault: false,
          hasProject: true,
          currentSource: 'project'
        });
      }
    }

    return status;
  }
}
