/**
 * Extended Bun type definitions
 * Adds types that bun-types doesn't provide yet
 */

declare global {
  namespace Bun {
    /**
     * Remove a file or directory
     */
    function remove(path: string | URL): Promise<void>;
  }
}

interface WorkerOptions {
  env?: Record<string, string>;
  resourceLimits?: {
    maxMemoryMB?: number;
    maxCpuTime?: number;
  };
}

export {};
