/**
 * Extension Dependency Bundler
 *
 * Uses Bun's bundler to create browser-compatible and Bun-compatible bundles of npm packages.
 * All dependencies are served from your own backend - no external CDN requests.
 *
 * Features:
 * - On-demand package bundling using Bun.build()
 * - Disk and memory caching
 * - Supports ESM and CommonJS packages
 * - Automatic transpilation for browser compatibility (frontend)
 * - Direct module loading for Bun runtime (backend)
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DependencyBundler');
const DEPS_CACHE_DIR = path.join(process.cwd(), 'data/cache/extension-deps');

export interface DependencyRequest {
  name: string;
  version: string;
  subpath?: string; // e.g., 'dist/chart.js' for packages with multiple exports
}

export interface BundledDependency {
  name: string;
  version: string;
  code: string;
  size: number;
  module?: any; // For backend dependencies - the actual imported module
}

/**
 * Dependency Bundler Service
 *
 * Bundles npm packages using Bun for use in extension UI components.
 */
export class DependencyBundler {
  private bundleCache = new Map<string, BundledDependency>();
  private cacheInitialized = false;

  constructor() {
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(DEPS_CACHE_DIR, { recursive: true });
    } catch (error) {
      logger.warn({ error }, 'Failed to create cache directory');
    }
  }

  /**
   * Generate cache key for a dependency
   */
  private getCacheKey(req: DependencyRequest): string {
    const subpath = req.subpath ? `/${req.subpath}` : '';
    return `${req.name}@${req.version}${subpath}`;
  }

  /**
   * Get file path for cached bundle
   */
  private getCachePath(cacheKey: string): string {
    const safeKey = cacheKey.replace(/[\/@]/g, '-');
    return path.join(DEPS_CACHE_DIR, `${safeKey}.js`);
  }

  /**
   * Initialize caches on first use
   */
  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;

    try {
      await this.ensureCacheDir();

      // Scan cache directory and preload metadata
      const entries = await fs.readdir(DEPS_CACHE_DIR);
      const bundleFiles = entries.filter(f => f.endsWith('.js'));

      for (const file of bundleFiles) {
        try {
          const filePath = path.join(DEPS_CACHE_DIR, file);
          const stat = await fs.stat(filePath);

          // Cache persists until manually cleared
          const cacheKey = file.replace('.js', '').replace(/-/g, '@').replace(/\//g, '/');
          const parts = cacheKey.split('@');
          this.bundleCache.set(cacheKey, {
            name: parts[0] || cacheKey,
            version: parts[1] || 'latest',
            code: '', // Loaded on demand
            size: stat.size
          });
        } catch (error) {
          logger.warn({ file }, 'Failed to scan cached bundle');
        }
      }

      this.cacheInitialized = true;
      logger.info({ cachedBundles: this.bundleCache.size }, 'Dependency bundle cache initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize cache');
      this.cacheInitialized = true;
    }
  }

  /**
   * Bundle a single dependency
   *
   * @param req - Dependency request with name, version, and optional subpath
   * @returns Bundled JavaScript code
   */
  async bundleDependency(req: DependencyRequest): Promise<string> {
    await this.initializeCache();

    const cacheKey = this.getCacheKey(req);

    // Check memory cache
    const cached = this.bundleCache.get(cacheKey);
    if (cached && cached.code) {
      logger.debug({ cacheKey }, 'Dependency bundle in memory cache');
      return cached.code;
    }

    // Check disk cache
    const cachedPath = this.getCachePath(cacheKey);
    try {
      await fs.access(cachedPath);
      const cachedCode = await fs.readFile(cachedPath, 'utf-8');

      // Update memory cache
      this.bundleCache.set(cacheKey, {
        name: req.name,
        version: req.version,
        code: cachedCode,
        size: cachedCode.length
      });

      logger.debug({ cacheKey }, 'Dependency bundle in disk cache');
      return cachedCode;
    } catch {
      // Not cached, need to bundle
    }

    // Bundle using Bun
    logger.info({ req }, 'Bundling dependency with Bun');

    try {
      // Create a temp entry point that imports the package
      const tempDir = path.join(DEPS_CACHE_DIR, 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempEntry = path.join(tempDir, `${cacheKey.replace(/[\/@]/g, '-')}.mjs`);

      // Build import path
      const importPath = req.subpath
        ? `${req.name}/${req.subpath}`
        : req.name;

      // Write entry point
      await fs.writeFile(
        tempEntry,
        `export * from '${importPath}'; export { default } from '${importPath}';`
      );

      // Use Bun to bundle
      const build = await Bun.build({
        entrypoints: [tempEntry],
        target: 'browser',
        format: 'esm',
        splitting: false,
        sourcemap: 'none',
        minify: true, // Minify for smaller bundles
        // Don't externalize anything - bundle everything
        external: [],
      });

      // Clean up temp file
      await fs.unlink(tempEntry).catch(() => {});

      // Get the output (Bun.build returns outputs directly)
      if (build.outputs.length === 0) {
        throw new Error('No output from bundling');
      }

      // Check for success
      const firstOutput = build.outputs[0];
      if (!firstOutput) {
        throw new Error('No output from bundling');
      }
      const bundledCode = await firstOutput.text();

      // Cache to disk
      await this.ensureCacheDir();
      await fs.writeFile(cachedPath, bundledCode, 'utf-8');

      // Cache in memory
      this.bundleCache.set(cacheKey, {
        name: req.name,
        version: req.version,
        code: bundledCode,
        size: bundledCode.length
      });

      logger.info({
        cacheKey,
        size: bundledCode.length,
        sizeKB: (bundledCode.length / 1024).toFixed(2)
      }, 'Dependency bundled successfully');

      return bundledCode;

    } catch (error) {
      logger.error({ req, error }, 'Failed to bundle dependency');
      throw new Error(`Failed to bundle ${req.name}@${req.version}: ${error}`);
    }
  }

  /**
   * Bundle multiple dependencies in parallel
   *
   * @param requests - Array of dependency requests
   * @returns Map of cache keys to bundled code
   */
  async bundleDependencies(requests: DependencyRequest[]): Promise<Map<string, string>> {
    await this.initializeCache();

    const results = new Map<string, string>();

    await Promise.all(
      requests.map(async (req) => {
        try {
          const cacheKey = this.getCacheKey(req);
          const code = await this.bundleDependency(req);
          results.set(cacheKey, code);
        } catch (error) {
          logger.error({ req, error }, 'Failed to bundle dependency');
          throw error;
        }
      })
    );

    return results;
  }

  /**
   * Create a combined bundle for multiple dependencies
   *
   * @param dependencies - Map of package names to versions
   * @returns Combined JavaScript bundle
   */
  async createCombinedBundle(dependencies: Record<string, string>): Promise<string> {
    const requests: DependencyRequest[] = Object.entries(dependencies).map(
      ([name, version]) => ({ name, version })
    );

    const bundledCode = await this.bundleDependencies(requests);

    // Create combined bundle with exports
    const combinedParts: string[] = [
      '// AIBase Extension Dependencies Bundle',
      `// Generated: ${new Date().toISOString()}`,
      '// Source: Bundled with Bun from npm packages',
      '',
    ];

    for (const [cacheKey, code] of bundledCode.entries()) {
      const name = cacheKey.split('@')[0];
      combinedParts.push(`// === ${name} ===`);
      combinedParts.push(code);
      combinedParts.push('');
    }

    // Export to window.libs
    combinedParts.push('// Expose all to window.libs');
    combinedParts.push('if (typeof window !== "undefined") {');
    combinedParts.push('  window.libs = window.libs || {};');

    for (const name of Object.keys(dependencies)) {
      combinedParts.push(`  // ${name} exports are available in the bundled code above`);
    }

    combinedParts.push('}');

    return combinedParts.join('\n');
  }

  /**
   * Clear bundle cache
   *
   * @param name - Optional package name (clears all if not specified)
   * @param version - Optional version (required if name is specified)
   */
  async clearCache(name?: string, version?: string): Promise<void> {
    if (name && version) {
      // Clear specific package
      const cacheKey = this.getCacheKey({ name, version });
      this.bundleCache.delete(cacheKey);

      const cachedPath = this.getCachePath(cacheKey);
      try {
        await fs.unlink(cachedPath);
        logger.info({ cacheKey }, 'Cleared dependency cache');
      } catch {}
    } else {
      // Clear all cache
      this.bundleCache.clear();
      try {
        await fs.rm(DEPS_CACHE_DIR, { recursive: true, force: true });
        logger.info('Cleared all dependency cache');
        this.cacheInitialized = false;
      } catch {}
    }
  }

  /**
   * Bundle a backend dependency for Bun runtime
   *
   * Unlike frontend dependencies which are bundled to ESM for browser,
   * backend dependencies are loaded directly as modules for Bun.
   *
   * @param req - Dependency request
   * @returns The imported module
   */
  async bundleBackendDependency(req: DependencyRequest): Promise<any> {
    await this.initializeCache();

    const cacheKey = `backend:${this.getCacheKey(req)}`;

    // Check if module is already loaded in memory
    if (this.bundleCache.has(cacheKey)) {
      const cached = this.bundleCache.get(cacheKey);
      if (cached && cached.module) {
        logger.debug({ cacheKey }, 'Backend dependency in memory cache');
        return cached.module;
      }
    }

    logger.info({ req }, 'Loading backend dependency with Bun');

    try {
      // Create a temp entry point that imports the package
      const tempDir = path.join(DEPS_CACHE_DIR, 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempEntry = path.join(tempDir, `backend_${req.name}_${Date.now()}.mjs`);

      // Build import path
      const importPath = req.subpath
        ? `${req.name}/${req.subpath}`
        : req.name;

      // For backend, we don't bundle - we just create an entry point
      // that re-exports the package, then import it directly
      await fs.writeFile(
        tempEntry,
        `export * from '${importPath}'; export { default } from '${importPath}';`
      );

      // Import the module directly using Bun's import
      // This is cached by Bun automatically
      const moduleUrl = `file://${tempEntry}`;
      const module = await import(moduleUrl);

      // Clean up temp file
      await fs.unlink(tempEntry).catch(() => {});

      // Cache the module (not the code)
      this.bundleCache.set(cacheKey, {
        name: req.name,
        version: req.version,
        code: '', // Not used for backend
        size: 0,
        module, // Store the actual module
      });

      logger.info({
        cacheKey,
        exports: Object.keys(module).filter(k => k !== 'default' && !k.startsWith('__'))
      }, 'Backend dependency loaded');

      return module;
    } catch (error) {
      logger.error({ req, error }, 'Failed to load backend dependency');
      throw new Error(`Failed to load backend dependency ${req.name}@${req.version}: ${error}`);
    }
  }

  /**
   * Bundle multiple backend dependencies
   *
   * @param requests - Dependency requests
   * @returns Map of package names to loaded modules
   */
  async bundleBackendDependencies(requests: DependencyRequest[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    await Promise.all(
      requests.map(async (req) => {
        try {
          const module = await this.bundleBackendDependency(req);
          results[req.name] = module;
        } catch (error) {
          logger.error({ req, error }, 'Failed to bundle backend dependency');
          throw error;
        }
      })
    );

    return results;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    memoryCacheSize: number;
    diskCacheSize: number;
    cachedPackages: string[];
  }> {
    await this.initializeCache();

    let diskCacheSize = 0;
    const cachedPackages: string[] = [];

    try {
      const entries = await fs.readdir(DEPS_CACHE_DIR);
      const bundleFiles = entries.filter(f => f.endsWith('.js'));

      for (const file of bundleFiles) {
        const filePath = path.join(DEPS_CACHE_DIR, file);
        const stat = await fs.stat(filePath);
        diskCacheSize += stat.size;
        cachedPackages.push(file.replace('.js', ''));
      }
    } catch {
      // Directory doesn't exist yet
    }

    return {
      memoryCacheSize: this.bundleCache.size,
      diskCacheSize,
      cachedPackages
    };
  }
}

// Singleton instance
export const dependencyBundler = new DependencyBundler();
