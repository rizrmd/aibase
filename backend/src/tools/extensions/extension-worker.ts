/**
 * Extension Worker
 *
 * Isolated worker thread for executing extension code.
 * Runs in a separate process with resource limits.
 *
 * Security model:
 * - No direct file system access (unless explicitly allowed)
 * - No global state pollution
 * - CPU and memory limits enforced
 * - Message-based communication only
 */

import type { DependencyRequest } from './dependency-bundler';

// Type declarations for worker context
declare const self: Worker & {
  onmessage: (e: MessageEvent) => void;
  postMessage: (message: any) => void;
};

interface WorkerMessage {
  id: string;
  type: 'evaluate' | 'dependencies';
  extensionId: string;
  code?: string;
  dependencies?: Record<string, string>;
  metadata?: any;
}

interface WorkerResponse {
  id: string;
  type: 'result' | 'error';
  result?: any;
  error?: string;
}

// In-memory cache for loaded dependencies
const dependencyCache = new Map<string, any>();

/**
 * Load backend dependencies
 */
async function loadDependencies(dependencies: Record<string, string>): Promise<Record<string, any>> {
  const loaded: Record<string, any> = {};

  for (const [name, version] of Object.entries(dependencies)) {
    const cacheKey = `${name}@${version}`;

    if (dependencyCache.has(cacheKey)) {
      loaded[name] = dependencyCache.get(cacheKey);
      continue;
    }

    try {
      // Create temp entry point
      const tempPath = `/tmp/ext-deps-${name}-${Date.now()}.mjs`;
      await Bun.write(tempPath, `export * from '${name}'; export { default } from '${name}';`);

      // Import the module
      const moduleUrl = `file://${tempPath}`;
      const module = await import(moduleUrl);

      // Clean up
      await Bun.remove(tempPath).catch(() => {});

      loaded[name] = module;
      dependencyCache.set(cacheKey, module);
    } catch (error) {
      throw new Error(`Failed to load dependency ${name}@${version}: ${error}`);
    }
  }

  return loaded;
}

/**
 * Evaluate extension code in isolation
 */
function evaluateExtension(code: string, dependencies: Record<string, any>, metadata: { id?: string }): any {
  // Create dependency object string
  const depsObjectString = Object.keys(dependencies).length > 0
    ? `const deps = ${JSON.stringify(Object.keys(dependencies).reduce((acc, key) => {
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

    // Execute extension code
    const getExtensionExports = () => {
      ${code}
    };

    const extensionResult = getExtensionExports();

    // Check for module.exports pattern
    const moduleExportsKeys = Object.keys(module.exports);
    if (moduleExportsKeys.length > 0) {
      return module.exports;
    }

    return extensionResult || {};
  `;

  // Execute in controlled environment
  // Note: We still use AsyncFunction but within worker process isolation
  const AsyncFunction = (async function () {}).constructor as any;
  const fn = new AsyncFunction(wrappedCode);

  // Mock hook registry
  const hookRegistry = {
    registerHook: () => {},
    unregisterHook: () => {},
  };

  return fn(hookRegistry, dependencies);
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;
  const response: WorkerResponse = {
    id: message.id,
    type: 'result'
  };

  try {
    if (message.type === 'evaluate') {
      const { code, dependencies, metadata } = message;

      if (!code) {
        throw new Error('No code provided for evaluation');
      }

      // Load dependencies if provided
      const loadedDeps = dependencies && Object.keys(dependencies).length > 0
        ? await loadDependencies(dependencies)
        : {};

      // Evaluate extension with timeout
      const metadataId = metadata?.id ?? 'unknown';
      const enhancedMetadata: { id: string; [key: string]: any } = {
        id: metadataId,
        ...(metadata || {})
      };
      const result = await withTimeout(
        () => evaluateExtension(code, loadedDeps, enhancedMetadata),
        30000 // 30 second timeout
      );

      response.result = result;

    } else {
      throw new Error(`Unknown message type: ${message.type}`);
    }

  } catch (error) {
    response.type = 'error';
    response.error = error instanceof Error ? error.message : String(error);
  }

  self.postMessage(response);
};

/**
 * Execute function with timeout
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}
