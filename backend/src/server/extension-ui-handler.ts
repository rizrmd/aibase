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

const extensionsDir = path.join(process.cwd(), 'backend/src/tools/extensions/defaults');
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
 * GET /api/extensions/:id/ui
 * Get transpiled & bundled extension UI component
 */
export async function handleGetExtensionUI(req: Request, extensionId: string): Promise<Response> {
  try {
    const uiPath = path.join(extensionsDir, extensionId, 'ui.tsx');

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

    // Check cache with metadata
    const cached = await getFromCacheWithMetadata(extensionId);
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
      format: 'esm',
      minify: isProduction(),            // Minify in production
      sourcemap: !isProduction(),        // Source maps in development only
      external: ['react', 'react-dom'],  // Exclude shared React deps
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

    const bundledCode = result.outputFiles[0].text;
    const contentHash = generateContentHash(bundledCode);
    const etag = generateETag(contentHash);

    // Save to cache with metadata
    await saveToCacheWithMetadata(extensionId, bundledCode, {
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
async function getFromCacheWithMetadata(extensionId: string): Promise<{ code: string; metadata: CacheMetadata } | null> {
  const cachePath = path.join(cacheDir, `${extensionId}.js`);
  const uiPath = path.join(extensionsDir, extensionId, 'ui.tsx');

  try {
    // Check cache exists
    await fs.access(cachePath);

    // Compare mtimes
    const [cacheStat, uiStat] = await Promise.all([
      fs.stat(cachePath),
      fs.stat(uiPath)
    ]);

    // Check in-memory metadata first
    const memMetadata = metadataCache.get(extensionId);
    if (memMetadata && memMetadata.sourceMtimeMs >= uiStat.mtimeMs) {
      const code = await fs.readFile(cachePath, 'utf-8');
      return { code, metadata: memMetadata };
    }

    // Cache is valid if newer than source
    if (cacheStat.mtimeMs >= uiStat.mtimeMs) {
      const code = await fs.readFile(cachePath, 'utf-8');
      // Try to load metadata from file
      const metadata = await loadMetadata(extensionId);
      if (metadata) {
        metadataCache.set(extensionId, metadata);
        return { code, metadata };
      }
    }

    logger.info({ extensionId }, 'Cache expired (source modified)');
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
  extensionId: string,
  code: string,
  metadata: CacheMetadata
): Promise<void> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${extensionId}.js`);
    const metadataPath = path.join(cacheDir, `${extensionId}.json`);

    await Promise.all([
      fs.writeFile(cachePath, code, 'utf-8'),
      fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    ]);

    metadataCache.set(extensionId, metadata);
    logger.info({ extensionId, size: code.length, etag: metadata.etag }, 'Cached bundled UI with metadata');
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
    const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
    const extensionDirs = entries.filter(entry => entry.isDirectory());

    let bundledCount = 0;
    let cachedCount = 0;

    for (const dir of extensionDirs) {
      const extensionId = dir.name;
      const uiPath = path.join(extensionsDir, extensionId, 'ui.tsx');

      try {
        // Check if ui.tsx exists
        await fs.access(uiPath);

        // Check if already cached
        const cached = await getFromCacheWithMetadata(extensionId);
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
          format: 'esm',
          minify: isProduction(),      // Minify in production
          sourcemap: !isProduction(),  // Source maps in development only
          external: ['react', 'react-dom'],
          write: false,
          outdir: 'out',
        });

        if (result.errors.length > 0) {
          logger.error({ extensionId, errors: result.errors }, 'Failed to pre-bundle extension UI');
          continue;
        }

        const bundledCode = result.outputFiles[0].text;
        const uiStat = await fs.stat(uiPath);
        const contentHash = generateContentHash(bundledCode);
        const etag = generateETag(contentHash);

        await saveToCacheWithMetadata(extensionId, bundledCode, {
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
