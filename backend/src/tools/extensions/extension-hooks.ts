/**
 * Extension Hook System
 * Allows extensions to register callbacks for specific events
 */

import { createLogger } from '../../utils/logger';

const logger = createLogger('ExtensionHooks');

export type HookType = 'afterFileUpload';

export interface FileUploadContext {
  convId: string;
  projectId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
}

export interface FileUploadResult {
  description?: string;
  title?: string;
  [key: string]: any;
}

export type FileUploadHook = (context: FileUploadContext) => Promise<FileUploadResult | void>;

/**
 * Hook registry for extension callbacks
 */
class ExtensionHookRegistry {
  private hooks: Map<HookType, Set<{ extensionId: string; callback: any }>> = new Map();

  /**
   * Register a hook for an extension
   */
  registerHook(type: HookType, extensionId: string, callback: any): void {
    if (!this.hooks.has(type)) {
      this.hooks.set(type, new Set());
    }

    const hooks = this.hooks.get(type)!;

    // Check if this extension already has a hook registered for this type
    const existing = Array.from(hooks).find(h => h.extensionId === extensionId);
    if (existing) {
      logger.debug({ type, extensionId }, 'Extension hook already registered, skipping');
      return;
    }

    hooks.add({ extensionId, callback });

    logger.info({ type, extensionId }, 'Extension hook registered');
  }

  /**
   * Unregister all hooks for an extension
   */
  unregisterExtensionHooks(extensionId: string): void {
    for (const [type, hooks] of this.hooks.entries()) {
      for (const hook of hooks) {
        if (hook.extensionId === extensionId) {
          hooks.delete(hook);
          logger.info({ type, extensionId }, 'Extension hook unregistered');
        }
      }
    }
  }

  /**
   * Execute all hooks of a specific type
   * Returns the first non-empty result from any hook
   */
  async executeHook(type: HookType, context: any): Promise<FileUploadResult | undefined> {
    const hooks = this.hooks.get(type);
    console.log('[ExtensionHooks] executeHook called:', { type, hookCount: hooks?.size || 0, contextKeys: Object.keys(context) });

    if (!hooks || hooks.size === 0) {
      console.log('[ExtensionHooks] No hooks registered for type:', type);
      return;
    }

    logger.debug({ type, hookCount: hooks.size }, 'Executing extension hooks');
    console.log('[ExtensionHooks] Registered hooks:', Array.from(hooks).map(h => h.extensionId));

    // Execute all hooks concurrently
    const promises = Array.from(hooks).map(async ({ extensionId, callback }) => {
      try {
        console.log('[ExtensionHooks] Calling hook:', extensionId);
        logger.debug({ type, extensionId }, 'Executing hook');
        const result = await callback(context);
        console.log('[ExtensionHooks] Hook result:', extensionId, result);
        if (result) {
          logger.debug({ type, extensionId, result }, 'Hook executed successfully');
          return result;
        }
      } catch (error: any) {
        console.error('[ExtensionHooks] Hook error:', extensionId, error);
        logger.error({ type, extensionId, error }, 'Hook execution failed');
      }
      return null;
    });

    const results = await Promise.all(promises);
    console.log('[ExtensionHooks] All hook results:', results);
    // Find first result with actual content (not null/undefined/empty object)
    return results.find(r => r && Object.keys(r).length > 0) || undefined;
  }

  /**
   * Clear all hooks (useful for testing)
   */
  clearAll(): void {
    this.hooks.clear();
  }
}

// Singleton instance
export const extensionHookRegistry = new ExtensionHookRegistry();
