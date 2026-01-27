/**
 * Extension UI Handler
 * Handles bundling and serving of co-located extension UI components
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('ExtensionUI');

const globalExtensionsDir = path.join(process.cwd(), 'backend/src/tools/extensions/defaults');
const cacheDir = path.join(process.cwd(), 'data/cache/extension-ui');

// Cache metadata storage
interface CacheMetadata {
  etag: string;
  contentHash: string;
  bundleSize: number;
  sourceMtimeMs: number;
  bundledAt: number;
}

const metadataCache = new Map<string, CacheMetadata>();

/**
 * Check if running in production mode
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Generate content hash for ETag
 */
function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate ETag from content hash
 */
function generateETag(contentHash: string): string {
  return `"${contentHash.substring(0, 32)}"`; // Use first 32 chars of hash
}

/**
 * Transform bundled code to replace external imports with window.libs references
 * This allows esbuild to externalize React while still making it available at runtime
 */
function transformBundledCode(code: string): string {
  let transformed = code;

  // Replace bare module imports with window.libs references
  // This handles: import ... from 'react' and import ... from 'react-dom'
  const importReplacements: [RegExp, string][] = [
    // Simple React import: import React from 'react'
    [/import\s+React\s+from\s+['"]react['"];?\s*\n?/g, 'const React = window.libs.React;\n'],
    // Star import: import * as React from 'react'
    [/import\s+\*\s+as\s+React\s+from\s+['"]react['"];?\s*\n?/g, 'const React = window.libs.React;\n'],
    // Destructured React imports: import { useState, useEffect } from 'react'
    [/import\s*\{\s*([^}]+)\s*\}\s+from\s+['"]react['"];?\s*\n?/g, 'const { $1 } = window.libs.React;\n'],
    // Combined: import React, { ... } from 'react'
    [/import\s+React\s*,\s*\{\s*([^}]+)\s*\}\s+from\s+['"]react['"];?\s*\n?/g, 'const React = window.libs.React;\nconst { $1 } = window.libs.React;\n'],
    // Remove jsx-runtime imports
    [/import\s+[^;]*?from\s+['"]react\/jsx[^'"]*['"];?\s*\n?/g, ''],
    // Other external dependencies (react-dom, etc.)
    [/import\s+\*\s+as\s+(\w+)\s+from\s+['"]react-dom['"];?\s*\n?/g, 'const $1 = window.libs.ReactDOM;\n'],
  ];

  for (const [pattern, replacement] of importReplacements) {
    transformed = transformed.replace(pattern, replacement);
  }

  return transformed;
}

/**
 * GET /api/extensions/:id/ui?projectId=xxx&tenantId=xxx
 * Get transpiled & bundled extension UI component
 *
 * Priority:
 * 1. Project-specific: data/{projectId}/extensions/{extensionId}/ui.tsx
 * 2. Global default: backend/src/tools/extensions/defaults/{extensionId}/ui.tsx
 */
export async function handleGetExtensionUI(req: Request, extensionId: string): Promise<Response> {
  try {
    // Extract projectId and tenantId from query params
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const tenantId = url.searchParams.get('tenantId');

    // Determine UI path with priority system
    let uiPath: string;
    let isProjectSpecific = false;

    if (projectId && tenantId) {
      // Check project-specific extension first
      const projectExtDir = path.join(process.cwd(), 'data', projectId, 'extensions', extensionId);
      const projectUIPath = path.join(projectExtDir, 'ui.tsx');

      try {
        await fs.access(projectUIPath);
        uiPath = projectUIPath;
        isProjectSpecific = true;
        logger.info({ extensionId, projectId, tenantId }, 'Using project-specific extension UI');
      } catch {
        // Project-specific UI not found, will use global default
        uiPath = path.join(globalExtensionsDir, extensionId, 'ui.tsx');
        logger.info({ extensionId, projectId, tenantId }, 'Project-specific UI not found, using global default');
      }
    } else {
      // No projectId provided, use global default
      uiPath = path.join(globalExtensionsDir, extensionId, 'ui.tsx');
    }

    // Check if ui.tsx exists
    try {
      await fs.access(uiPath);
    } catch {
      logger.info({ extensionId }, 'Extension UI not found');
      return Response.json(
        { success: false, error: 'Extension UI not found' },
        { status: 404 }
      );
    }

    // Check If-None-Match header for conditional request
    const ifNoneMatch = req.headers.get('If-None-Match');

    // Check cache with metadata (pass uiPath for proper cache key)
    const cached = await getFromCacheWithMetadata(extensionId, uiPath);
    if (cached && cached.metadata) {
      // Return 304 if ETag matches
      if (ifNoneMatch && ifNoneMatch === cached.metadata.etag) {
        logger.info({ extensionId, cache: 'HIT', etag: cached.metadata.etag }, 'Returning 304 Not Modified');
        return new Response(null, {
          status: 304,
          headers: {
            'ETag': cached.metadata.etag,
            'X-Extension-Cache': 'HIT',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      logger.info({ extensionId, cache: 'HIT', etag: cached.metadata.etag }, 'Returning cached extension UI');
      return new Response(cached.code, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'ETag': cached.metadata.etag,
          'X-Extension-Cache': 'HIT',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // Read UI code
    const uiCode = await fs.readFile(uiPath, 'utf-8');

    // Get source file stats
    const uiStat = await fs.stat(uiPath);

    // Bundle dengan esbuild
    logger.info({ extensionId, production: isProduction() }, 'Bundling extension UI with esbuild');

    const result = await esbuild.build({
      entryPoints: [uiPath],
      bundle: true,                      // Bundle dependencies
      platform: 'browser',
      target: 'es2020',
      format: 'cjs',                     // CommonJS format (uses module.exports)
      jsx: 'automatic',                  // Automatic JSX runtime (no jsx-runtime imports needed)
      minify: isProduction(),            // Minify in production
      sourcemap: !isProduction(),        // Source maps in development only
      // Externalize React dependencies - they'll be provided by window.libs at runtime
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      write: false,
      outdir: 'out',
    });

    if (result.errors.length > 0) {
      logger.error({ extensionId, errors: result.errors }, 'esbuild errors');
      return Response.json(
        {
          success: false,
          error: 'Failed to bundle extension UI',
          errors: result.errors.map(e => e.text)
        },
        { status: 500 }
      );
    }

    // Extract the JS file (not the sourcemap) from output files
    // When sourcemap is enabled, outputFiles contains both .js and .js.map
    const jsFile = result.outputFiles.find(f => !f.path.endsWith('.map'));
    if (!jsFile) {
      logger.error({ extensionId }, 'No JS file in esbuild output');
      return Response.json(
        { success: false, error: 'Failed to bundle extension UI' },
        { status: 500 }
      );
    }

    let bundledCode = jsFile.text;

    // Transform bundled code to replace external imports with window.libs references
    bundledCode = transformBundledCode(bundledCode);
    const contentHash = generateContentHash(bundledCode);
    const etag = generateETag(contentHash);

    // Save to cache with metadata (pass uiPath for proper cache key)
    await saveToCacheWithMetadata(uiPath, bundledCode, {
      etag,
      contentHash,
      bundleSize: bundledCode.length,
      sourceMtimeMs: uiStat.mtimeMs,
      bundledAt: Date.now()
    });

    logger.info({
      extensionId,
      cache: 'MISS',
      size: bundledCode.length,
      etag
    }, 'Extension UI bundled successfully');

    return new Response(bundledCode, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'ETag': etag,
        'X-Extension-Cache': 'MISS',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    logger.error({ extensionId, error }, 'Error bundling extension UI');
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to bundle extension UI'
      },
      { status: 500 }
    );
  }
}

/**
 * Check cache with metadata and mtime-based invalidation
 */
async function getFromCacheWithMetadata(
  extensionId: string,
  uiPath: string
): Promise<{ code: string; metadata: CacheMetadata } | null> {
  // Generate cache key from uiPath (includes project-specific info)
  const cacheKey = path.relative(process.cwd(), uiPath)
    .replace(/[\/\\]/g, '-')
    .replace(/\.tsx$/, '');

  const cachePath = path.join(cacheDir, `${cacheKey}.js`);

  try {
    // Check cache exists
    await fs.access(cachePath);

    // Compare mtimes
    const [cacheStat, uiStat] = await Promise.all([
      fs.stat(cachePath),
      fs.stat(uiPath)
    ]);

    // Check in-memory metadata first
    const memMetadata = metadataCache.get(cacheKey);
    if (memMetadata && memMetadata.sourceMtimeMs >= uiStat.mtimeMs) {
      const code = await fs.readFile(cachePath, 'utf-8');
      return { code, metadata: memMetadata };
    }

    // Cache is valid if newer than source
    if (cacheStat.mtimeMs >= uiStat.mtimeMs) {
      const code = await fs.readFile(cachePath, 'utf-8');
      // Try to load metadata from file
      const metadata = await loadMetadata(cacheKey);
      if (metadata) {
        metadataCache.set(cacheKey, metadata);
        return { code, metadata };
      }
    }

    logger.info({ extensionId, cacheKey }, 'Cache expired (source modified)');
    return null;
  } catch (error) {
    // Cache doesn't exist or error reading
    return null;
  }
}

/**
 * Save to cache with metadata
 */
async function saveToCacheWithMetadata(
  uiPath: string,
  code: string,
  metadata: CacheMetadata
): Promise<void> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });

    // Generate cache key from uiPath
    const cacheKey = path.relative(process.cwd(), uiPath)
      .replace(/[\/\\]/g, '-')
      .replace(/\.tsx$/, '');

    const cachePath = path.join(cacheDir, `${cacheKey}.js`);
    const metadataPath = path.join(cacheDir, `${cacheKey}.json`);

    await Promise.all([
      fs.writeFile(cachePath, code, 'utf-8'),
      fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    ]);

    metadataCache.set(cacheKey, metadata);
    logger.info({ cacheKey, size: code.length, etag: metadata.etag }, 'Cached bundled UI with metadata');
  } catch (error) {
    logger.error({ extensionId, error }, 'Failed to cache bundled UI');
    // Non-fatal, continue without caching
  }
}

/**
 * Load metadata from cache directory
 */
async function loadMetadata(extensionId: string): Promise<CacheMetadata | null> {
  try {
    const metadataPath = path.join(cacheDir, `${extensionId}.json`);
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as CacheMetadata;
  } catch (error) {
    return null;
  }
}

/**
 * Pre-bundle all extension UIs on server startup
 * Called during server initialization to warm up the cache
 */
export async function preBundleExtensionUIs(): Promise<void> {
  logger.info('Pre-bundling extension UIs...');

  try {
    // Get all extension directories
    const entries = await fs.readdir(globalExtensionsDir, { withFileTypes: true });
    const extensionDirs = entries.filter(entry => entry.isDirectory());

    let bundledCount = 0;
    let cachedCount = 0;

    for (const dir of extensionDirs) {
      const extensionId = dir.name;
      const uiPath = path.join(globalExtensionsDir, extensionId, 'ui.tsx');

      try {
        // Check if ui.tsx exists
        await fs.access(uiPath);

        // Check if already cached (pass uiPath for proper cache key)
        const cached = await getFromCacheWithMetadata(extensionId, uiPath);
        if (cached) {
          cachedCount++;
          logger.debug({ extensionId }, 'Extension UI already cached');
          continue;
        }

        // Read and bundle
        logger.debug({ extensionId }, 'Pre-bundling extension UI');

        const result = await esbuild.build({
          entryPoints: [uiPath],
          bundle: true,
          platform: 'browser',
          target: 'es2020',
          format: 'cjs',                 // CommonJS format (uses module.exports)
          jsx: 'automatic',              // Automatic JSX runtime (no jsx-runtime imports needed)
          minify: isProduction(),        // Minify in production
          sourcemap: !isProduction(),    // Source maps in development only
          // Externalize React dependencies - they'll be provided by window.libs at runtime
          external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
          write: false,
          outdir: 'out',
        });

        if (result.errors.length > 0) {
          logger.error({ extensionId, errors: result.errors }, 'Failed to pre-bundle extension UI');
          continue;
        }

        // Extract the JS file (not the sourcemap) from output files
        const jsFile = result.outputFiles.find(f => !f.path.endsWith('.map'));
        if (!jsFile) {
          logger.error({ extensionId }, 'No JS file in esbuild output');
          continue;
        }

        let bundledCode = jsFile.text;

        // Transform bundled code to replace external imports with window.libs references
        bundledCode = transformBundledCode(bundledCode);
        const uiStat = await fs.stat(uiPath);
        const contentHash = generateContentHash(bundledCode);
        const etag = generateETag(contentHash);

        await saveToCacheWithMetadata(uiPath, bundledCode, {
          etag,
          contentHash,
          bundleSize: bundledCode.length,
          sourceMtimeMs: uiStat.mtimeMs,
          bundledAt: Date.now()
        });

        bundledCount++;
        logger.debug({ extensionId, size: bundledCode.length }, 'Pre-bundled extension UI');
      } catch (error) {
        // UI doesn't exist or error - skip
        logger.debug({ extensionId }, 'No UI to pre-bundle');
      }
    }

    logger.info({ bundled: bundledCount, cached: cachedCount, total: extensionDirs.length }, 'Pre-bundling complete');
  } catch (error) {
    logger.error({ error }, 'Failed to pre-bundle extension UIs');
    // Non-fatal, server can continue
  }
}

/**
 * Clear cache for a specific extension
 * @param extensionId - Extension ID
 * @param projectId - Optional project ID for project-specific extensions
 * @returns Number of cache files deleted
 */
export async function clearExtensionCache(
  extensionId: string,
  projectId?: string
): Promise<number> {
  let deletedCount = 0;

  try {
    // Generate possible cache keys to delete
    const cacheKeysToDelete: string[] = [];

    // 1. Project-specific cache key: data-{projectId}-extensions-{extensionId}-ui
    if (projectId) {
      cacheKeysToDelete.push(`data-${projectId}-extensions-${extensionId}-ui`);
    }

    // 2. Global default cache key: backend-src-tools-extensions-defaults-{extensionId}-ui
    cacheKeysToDelete.push(`backend-src-tools-extensions-defaults-${extensionId}-ui`);

    // Delete cache files for each key
    for (const cacheKey of cacheKeysToDelete) {
      const cachePath = path.join(cacheDir, `${cacheKey}.js`);
      const metadataPath = path.join(cacheDir, `${cacheKey}.json`);

      // Delete .js cache file
      try {
        await fs.unlink(cachePath);
        deletedCount++;
        logger.debug({ cacheKey }, 'Deleted extension UI cache file');
      } catch {
        // File doesn't exist, skip
      }

      // Delete .json metadata file
      try {
        await fs.unlink(metadataPath);
        deletedCount++;
        logger.debug({ cacheKey }, 'Deleted extension UI metadata file');
      } catch {
        // File doesn't exist, skip
      }

      // Clear in-memory metadata cache
      metadataCache.delete(cacheKey);
    }

    logger.info({ extensionId, projectId, deletedCount }, 'Extension cache cleared');
  } catch (error) {
    logger.error({ extensionId, projectId, error }, 'Error clearing extension cache');
  }

  return deletedCount;
}
