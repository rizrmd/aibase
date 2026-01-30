/**
 * File Context Storage - manages which files are included in LLM context
 * Stores per-project file_context.json mapping file IDs to include-in-context boolean
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getProjectDir } from '../config/paths';

/**
 * File context mapping: file ID (e.g., "file_1234567890_abc123") -> included in context
 */
export interface FileContextMapping {
  [fileId: string]: boolean;
}

/**
 * File context data structure with metadata
 */
export interface FileContextData {
  version: string;
  updatedAt: number;
  files: FileContextMapping;
}

/**
 * Storage class for file context management
 */
export class FileContextStorage {
  private static instance: FileContextStorage;
  private cache: Map<string, FileContextData> = new Map();

  private constructor() {}

  static getInstance(): FileContextStorage {
    if (!FileContextStorage.instance) {
      FileContextStorage.instance = new FileContextStorage();
    }
    return FileContextStorage.instance;
  }

  /**
   * Get the path to the file_context.json for a project
   */
  private getFilePath(projectId: string, tenantId: number | string): string {
    const projectDir = getProjectDir(projectId, tenantId);
    return path.join(projectDir, 'file_context.json');
  }

  /**
   * Load file context data for a project
   * Returns default empty structure if file doesn't exist
   */
  async loadFileContext(projectId: string, tenantId: number | string): Promise<FileContextData> {
    const cacheKey = `${tenantId}/${projectId}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const filePath = this.getFilePath(projectId, tenantId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data: FileContextData = JSON.parse(content);
      this.cache.set(cacheKey, data);
      console.log(`[FileContextStorage] Loaded file context for ${projectId}: ${Object.keys(data.files).length} files`);
      return data;
    } catch (error: any) {
      // File doesn't exist or is invalid, return default
      if (error.code === 'ENOENT') {
        const defaultData: FileContextData = {
          version: '1.0',
          updatedAt: Date.now(),
          files: {},
        };
        console.log(`[FileContextStorage] No file context found for ${projectId}, using default`);
        return defaultData;
      }
      console.error(`[FileContextStorage] Error loading file context for ${projectId}:`, error);
      return {
        version: '1.0',
        updatedAt: Date.now(),
        files: {},
      };
    }
  }

  /**
   * Save file context data for a project
   */
  async saveFileContext(projectId: string, tenantId: number | string, data: FileContextData): Promise<void> {
    const cacheKey = `${tenantId}/${projectId}`;
    const filePath = this.getFilePath(projectId, tenantId);

    // Update metadata
    data.updatedAt = Date.now();

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // Update cache
    this.cache.set(cacheKey, data);

    console.log(`[FileContextStorage] Saved file context for ${projectId}: ${Object.keys(data.files).length} files`);
  }

  /**
   * Check if a specific file ID is included in context
   */
  async isFileInContext(fileId: string, projectId: string, tenantId: number | string): Promise<boolean> {
    const data = await this.loadFileContext(projectId, tenantId);
    return data.files[fileId] === true;
  }

  /**
   * Set whether a file is included in context
   */
  async setFileInContext(
    fileId: string,
    included: boolean,
    projectId: string,
    tenantId: number | string
  ): Promise<void> {
    const data = await this.loadFileContext(projectId, tenantId);

    if (included) {
      data.files[fileId] = true;
    } else {
      delete data.files[fileId];
    }

    await this.saveFileContext(projectId, tenantId, data);
    console.log(`[FileContextStorage] Set file ${fileId} in context: ${included}`);
  }

  /**
   * Get all file IDs that are included in context
   */
  async getIncludedFileIds(projectId: string, tenantId: number | string): Promise<string[]> {
    const data = await this.loadFileContext(projectId, tenantId);
    return Object.keys(data.files).filter(fileId => data.files[fileId] === true);
  }

  /**
   * Bulk set multiple files in context
   * Useful for auto-checking new files when < 10 total files
   */
  async bulkSetFilesInContext(
    fileIds: string[],
    included: boolean,
    projectId: string,
    tenantId: number | string
  ): Promise<void> {
    const data = await this.loadFileContext(projectId, tenantId);

    for (const fileId of fileIds) {
      if (included) {
        data.files[fileId] = true;
      } else {
        delete data.files[fileId];
      }
    }

    await this.saveFileContext(projectId, tenantId, data);
    console.log(`[FileContextStorage] Bulk set ${fileIds.length} files in context: ${included}`);
  }

  /**
   * Remove a file ID from the context (e.g., when file is deleted)
   */
  async removeFile(fileId: string, projectId: string, tenantId: number | string): Promise<void> {
    const data = await this.loadFileContext(projectId, tenantId);

    if (fileId in data.files) {
      delete data.files[fileId];
      await this.saveFileContext(projectId, tenantId, data);
      console.log(`[FileContextStorage] Removed file ${fileId} from context`);
    }
  }

  /**
   * Clear cache for a specific project
   * Call this after external modifications to file_context.json
   */
  clearCache(projectId: string, tenantId: number | string): void {
    const cacheKey = `${tenantId}/${projectId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cached data
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}
