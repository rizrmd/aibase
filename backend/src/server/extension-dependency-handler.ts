/**
 * Extension Dependency Handler
 *
 * API endpoints for bundling and serving extension dependencies.
 * All dependencies are bundled locally using Bun - no external CDN requests.
 */

import { dependencyBundler } from '../tools/extensions/dependency-bundler';
import { createLogger } from '../utils/logger';

const logger = createLogger('ExtensionDependency');

/**
 * GET /api/extensions/dependencies/stats
 *
 * Returns cache statistics for dependency bundles.
 */
export async function handleGetDependencyStats(): Promise<Response> {
  try {
    const stats = await dependencyBundler.getCacheStats();

    return Response.json({
      success: true,
      stats: {
        memoryCacheSize: stats.memoryCacheSize,
        diskCacheSizeBytes: stats.diskCacheSize,
        diskCacheSizeKB: (stats.diskCacheSize / 1024).toFixed(2),
        cachedPackages: stats.cachedPackages.length,
        packages: stats.cachedPackages
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get dependency stats');
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/extensions/dependencies/bundle
 *
 * Request body:
 * {
 *   "dependencies": {
 *     "d3": "^7.9.0",
 *     "plotly.js-dist-min": "^2.27.0"
 *   }
 * }
 *
 * Returns: Combined bundled JavaScript code
 */
export async function handleBundleDependencies(req: Request): Promise<Response> {
  try {
    const body = await req.json() as { dependencies?: Record<string, string> };
    const dependencies: Record<string, string> = body.dependencies || {};

    if (Object.keys(dependencies).length === 0) {
      return Response.json(
        {
          success: false,
          error: 'No dependencies specified'
        },
        { status: 400 }
      );
    }

    logger.info({ dependencies }, 'Bundling extension dependencies');

    // Create combined bundle
    const bundledCode = await dependencyBundler.createCombinedBundle(dependencies);

    // Return as JavaScript with caching headers
    return new Response(bundledCode, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'X-AIBase-Dependency-Bundle': 'true',
      },
    });

  } catch (error) {
    logger.error({ error }, 'Failed to bundle dependencies');
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/extensions/dependencies/cache
 *
 * Clear dependency bundle cache.
 *
 * Query params:
 * - name: Optional package name
 * - version: Optional version (required if name is specified)
 *
 * Examples:
 * - DELETE /api/extensions/dependencies/cache (clears all)
 * - DELETE /api/extensions/dependencies/cache?name=d3&version=7.9.0 (clears specific)
 */
export async function handleClearDependencyCache(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    const version = url.searchParams.get('version');

    if (name && !version) {
      return Response.json(
        {
          success: false,
          error: 'Version parameter is required when specifying package name'
        },
        { status: 400 }
      );
    }

    await dependencyBundler.clearCache(name || undefined, version || undefined);

    return Response.json({
      success: true,
      message: name
        ? `Cleared cache for ${name}@${version}`
        : 'Cleared all dependency cache'
    });
  } catch (error) {
    logger.error({ error }, 'Failed to clear dependency cache');
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
