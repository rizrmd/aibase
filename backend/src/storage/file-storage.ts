/**
 * File storage service for handling uploaded files
 * Stores files in data/projects/[proj-id]/conversations/[conv-id]/files/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getConversationFilesDir } from '../config/paths';

export type FileScope = 'user' | 'public';

export interface StoredFile {
  name: string;
  size: number;
  type: string;
  path: string;
  uploadedAt: number;
  scope: FileScope;
  thumbnailUrl?: string;
  description?: string;
}

export class FileStorage {
  private static instance: FileStorage;
  private cacheInvalidationCallbacks: Array<() => void> = [];

  private constructor() {
    // No baseDir needed - using centralized path config
  }

  static getInstance(): FileStorage {
    if (!FileStorage.instance) {
      FileStorage.instance = new FileStorage();
    }
    return FileStorage.instance;
  }

  /**
   * Register a callback to be called when file metadata is updated
   * Used to invalidate caches in the file tool
   */
  registerCacheInvalidationCallback(callback: () => void): void {
    this.cacheInvalidationCallbacks.push(callback);
  }

  /**
   * Trigger all registered cache invalidation callbacks
   */
  private invalidateCaches(): void {
    for (const callback of this.cacheInvalidationCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('[FileStorage] Cache invalidation callback failed:', error);
      }
    }
  }

  /**
   * Get the directory path for a conversation
   */
  private getConvDir(convId: string, projectId: string, tenantId: number | string): string {
    return getConversationFilesDir(projectId, convId, tenantId);
  }

  /**
   * Ensure conversation directory exists
   */
  private async ensureConvDir(convId: string, projectId: string, tenantId: number | string): Promise<void> {
    const convDir = this.getConvDir(convId, projectId, tenantId);
    await fs.mkdir(convDir, { recursive: true });
  }

  /**
   * Get metadata file path for a file
   */
  private getMetaFilePath(convId: string, fileName: string, projectId: string, tenantId: number | string): string {
    const convDir = this.getConvDir(convId, projectId, tenantId);
    return path.join(convDir, `.${fileName}.meta.md`);
  }

  /**
   * Save metadata for a file in frontmatter format
   */
  private async saveFileMeta(
    convId: string,
    fileName: string,
    projectId: string,
    tenantId: number | string,
    meta: { scope: FileScope; uploadedAt?: number; size?: number; type?: string; thumbnailUrl?: string; description?: string }
  ): Promise<void> {
    const metaPath = this.getMetaFilePath(convId, fileName, projectId, tenantId);

    // Build frontmatter (metadata only, description goes in body)
    const frontmatter = Object.entries(meta)
      .filter(([key, value]) => key !== 'description' && value !== undefined)
      .map(([key, value]) => {
        const stringValue = typeof value === 'string' ? value : String(value);
        return `${key}: ${typeof value === 'string' ? `"${stringValue}"` : value}`;
      })
      .join('\n');

    // Combine frontmatter + description as body content
    const content = meta.description
      ? `---\n${frontmatter}\n---\n${meta.description}\n`
      : `---\n${frontmatter}\n---\n`;

    console.log(`[FileStorage] Saving metadata to ${metaPath}`);
    console.log(`[FileStorage] Description length: ${meta.description?.length || 0}`);
    await fs.writeFile(metaPath, content, 'utf-8');
  }

  /**
   * Load metadata for a file from frontmatter format
   */
  private async loadFileMeta(
    convId: string,
    fileName: string,
    projectId: string,
    tenantId: number | string
  ): Promise<{ scope: FileScope; uploadedAt?: number; size?: number; type?: string; thumbnailUrl?: string; description?: string }> {
    const metaPath = this.getMetaFilePath(convId, fileName, projectId, tenantId);

    try {
      const content = await fs.readFile(metaPath, 'utf-8');

      // Parse frontmatter between --- delimiters
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return { scope: 'user' };
      }

      const frontmatter = frontmatterMatch[1];
      if (!frontmatter) {
        return { scope: 'user' };
      }

      const meta: any = {};

      // Parse YAML-style key: value pairs from frontmatter
      for (const line of frontmatter.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          let value = line.slice(colonIndex + 1).trim();

          // Remove quotes from string values
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          // Parse numbers and booleans (convert to string to avoid type errors)
          if (value === 'true') value = 'true';
          else if (value === 'false') value = 'false';
          else if (!isNaN(Number(value))) value = String(value);

          meta[key] = value;
        }
      }

      // Extract description from body (everything after the second ---)
      // Allow optional whitespace after the closing ---
      const bodyMatch = content.match(/\n---\s*\n([\s\S]*)$/);
      if (bodyMatch && bodyMatch[1]) {
        meta.description = bodyMatch[1].trim();
        if (meta.description) {
          console.log(`[FileStorage] Loaded description for ${fileName}: ${meta.description.substring(0, 50)}...`);
        }
      } else {
        console.log(`[FileStorage] No body found in metadata for ${fileName}`);
      }

      return meta.scope ? meta : { scope: 'user', ...meta };
    } catch (error: any) {
      // Metadata file doesn't exist, assume default scope
      if (error.code === 'ENOENT') {
        return { scope: 'user' };
      }
      throw error;
    }
  }

  /**
   * Save a file to disk
   * @throws Error if a file with the same name already exists
   */
  async saveFile(
    convId: string,
    fileName: string,
    fileBuffer: Buffer,
    fileType: string,
    projectId: string,
    tenantId: number | string,
    scope: FileScope = 'user',
    thumbnailUrl?: string,
    description?: string
  ): Promise<StoredFile> {
    await this.ensureConvDir(convId, projectId, tenantId);

    // Sanitize filename to prevent directory traversal
    const sanitizedFileName = path.basename(fileName);

    const filePath = path.join(this.getConvDir(convId, projectId, tenantId), sanitizedFileName);

    // Check if file already exists to prevent overwrites
    try {
      await fs.access(filePath);
      throw new Error(`File "${sanitizedFileName}" already exists. Please use a different filename.`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        // Re-throw if it's not a "file doesn't exist" error
        throw error;
      }
      // File doesn't exist, proceed with save
    }

    // Write buffer directly to disk
    await fs.writeFile(filePath, fileBuffer);

    // Get file stats
    const stats = await fs.stat(filePath);
    const uploadedAt = Date.now();

    // Save metadata
    await this.saveFileMeta(convId, sanitizedFileName, projectId, tenantId, {
      scope,
      uploadedAt,
      size: stats.size,
      type: fileType,
      thumbnailUrl,
      description
    });

    return {
      name: sanitizedFileName,
      size: stats.size,
      type: fileType,
      path: filePath,
      uploadedAt,
      scope,
      thumbnailUrl,
      description
    };
  }

  /**
   * List all files for a conversation, optionally filtered by scope
   */
  async listFiles(convId: string, projectId: string, tenantId: number | string, scope?: FileScope): Promise<StoredFile[]> {
    const convDir = this.getConvDir(convId, projectId, tenantId);

    try {
      const entries = await fs.readdir(convDir, { withFileTypes: true });
      const files: StoredFile[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          // Skip metadata files
          if (entry.name.startsWith('.')) {
            continue;
          }

          const filePath = path.join(convDir, entry.name);
          const stats = await fs.stat(filePath);

          // Load metadata for scope
          const meta = await this.loadFileMeta(convId, entry.name, projectId, tenantId);

          // Filter by scope if specified
          if (scope && meta.scope !== scope) {
            continue;
          }

          files.push({
            name: entry.name,
            size: stats.size,
            type: meta.type || '', // Load type from metadata
            path: filePath,
            uploadedAt: stats.mtimeMs,
            scope: meta.scope,
            thumbnailUrl: meta.thumbnailUrl,
            description: meta.description,
          });
        }
      }

      return files;
    } catch (error: any) {
      // Directory doesn't exist or is empty
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific file
   */
  async getFile(convId: string, fileName: string, projectId: string, tenantId: number | string): Promise<Buffer> {
    // Sanitize filename and decode URL-encoded characters (e.g., %20 -> space)
    const sanitizedFileName = path.basename(fileName);
    const decodedFileName = decodeURIComponent(sanitizedFileName);
    const filePath = path.join(this.getConvDir(convId, projectId, tenantId), decodedFileName);

    return await fs.readFile(filePath);
  }

  /**
   * Delete a file
   */
  async deleteFile(convId: string, fileName: string, projectId: string, tenantId: number | string): Promise<void> {
    // Sanitize filename and decode URL-encoded characters (e.g., %20 -> space)
    const sanitizedFileName = path.basename(fileName);
    const decodedFileName = decodeURIComponent(sanitizedFileName);
    const filePath = path.join(this.getConvDir(convId, projectId, tenantId), decodedFileName);

    await fs.unlink(filePath);

    // Also delete metadata file if it exists
    const metaPath = this.getMetaFilePath(convId, decodedFileName, projectId, tenantId);
    try {
      await fs.unlink(metaPath);
    } catch (error: any) {
      // Metadata file might not exist, ignore
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Rename/move a file within the same conversation
   */
  async renameFile(convId: string, oldName: string, newName: string, projectId: string, tenantId: number | string): Promise<void> {
    const sanitizedOldName = path.basename(oldName);
    const decodedOldName = decodeURIComponent(sanitizedOldName);
    const sanitizedNewName = path.basename(newName);

    const oldPath = path.join(this.getConvDir(convId, projectId, tenantId), decodedOldName);
    const newPath = path.join(this.getConvDir(convId, projectId, tenantId), sanitizedNewName);

    // Check if source file exists
    try {
      await fs.access(oldPath);
    } catch (error: any) {
      throw new Error(`Source file "${oldName}" not found`);
    }

    // Check if destination file already exists
    try {
      await fs.access(newPath);
      throw new Error(`File "${newName}" already exists`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Rename the file
    await fs.rename(oldPath, newPath);

    // Also rename metadata file if it exists
    const oldMetaPath = this.getMetaFilePath(convId, decodedOldName, projectId, tenantId);
    const newMetaPath = this.getMetaFilePath(convId, sanitizedNewName, projectId, tenantId);

    try {
      await fs.rename(oldMetaPath, newMetaPath);
    } catch (error: any) {
      // Metadata file might not exist, ignore
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Move a file to a different conversation
   */
  async moveFile(
    fromConvId: string,
    toConvId: string,
    fileName: string,
    projectId: string,
    tenantId: number | string
  ): Promise<void> {
    const sanitizedName = path.basename(fileName);
    const decodedName = decodeURIComponent(sanitizedName);

    const fromPath = path.join(this.getConvDir(fromConvId, projectId, tenantId), decodedName);
    const toPath = path.join(this.getConvDir(toConvId, projectId, tenantId), decodedName);

    // Ensure target directory exists
    await this.ensureConvDir(toConvId, projectId, tenantId);

    // Check if source file exists
    try {
      await fs.access(fromPath);
    } catch (error: any) {
      throw new Error(`Source file "${fileName}" not found`);
    }

    // Check if destination file already exists
    try {
      await fs.access(toPath);
      throw new Error(`File "${fileName}" already exists in target conversation`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Move the file
    await fs.rename(fromPath, toPath);

    // Also move metadata file if it exists
    const oldMetaPath = this.getMetaFilePath(fromConvId, decodedName, projectId, tenantId);
    const newMetaPath = this.getMetaFilePath(toConvId, decodedName, projectId, tenantId);

    try {
      await fs.rename(oldMetaPath, newMetaPath);
    } catch (error: any) {
      // Metadata file might not exist, ignore
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Delete all files for a conversation
   */
  async deleteAllFiles(convId: string, projectId: string, tenantId: number | string): Promise<void> {
    const convDir = this.getConvDir(convId, projectId, tenantId);

    try {
      await fs.rm(convDir, { recursive: true, force: true });
    } catch (error: any) {
      // Ignore if directory doesn't exist
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get total storage size for a conversation
   */
  async getStorageSize(convId: string, projectId: string, tenantId: number | string): Promise<number> {
    const files = await this.listFiles(convId, projectId, tenantId);
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Update metadata for an existing file
   */
  async updateFileMeta(
    convId: string,
    fileName: string,
    projectId: string,
    tenantId: number | string,
    updates: { description?: string }
  ): Promise<void> {
    // Load existing metadata
    const existingMeta = await this.loadFileMeta(convId, fileName, projectId, tenantId);

    // Merge with updates
    const updatedMeta = {
      ...existingMeta,
      ...updates
    };

    // Save updated metadata
    await this.saveFileMeta(convId, fileName, projectId, tenantId, updatedMeta);

    // Invalidate caches so file tool sees the updated metadata
    this.invalidateCaches();
  }

  /**
   * Migrate all .meta.json files to .meta.md format for a project
   * @deprecated This method is obsolete after tenant-based reorganization
   */
  async migrateMetadataFiles(projectId: string, tenantId: number | string): Promise<{ migrated: number; errors: string[] }> {
    const { getProjectDir } = await import('../config/paths');
    const projectDir = getProjectDir(projectId, tenantId);
    const errors: string[] = [];
    const countRef = { count: 0 };

    try {
      // Recursively find all .meta.json files in the project
      await this.migrateDirectory(projectDir, errors, countRef);
    } catch (error: any) {
      errors.push(`Migration failed: ${error.message}`);
    }

    return { migrated: countRef.count, errors };
  }

  private async migrateDirectory(dirPath: string, errors: string[], countRef: { count: number }): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.migrateDirectory(fullPath, errors, countRef);
        } else if (entry.name.endsWith('.meta.json')) {
          // Migrate this metadata file
          try {
            await this.convertJsonToMd(fullPath);
            countRef.count++;
          } catch (error: any) {
            errors.push(`Failed to migrate ${entry.name}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      // Directory might not exist, skip it
      if (error.code !== 'ENOENT') {
        errors.push(`Failed to read directory ${dirPath}: ${error.message}`);
      }
    }
  }

  private async convertJsonToMd(jsonPath: string): Promise<void> {
    // Read JSON metadata
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const meta = JSON.parse(jsonContent);

    // Build frontmatter content
    const frontmatter = Object.entries(meta)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
      .join('\n');

    const mdContent = `---
${frontmatter}
---
`;

    // Write to .md file
    const mdPath = jsonPath.replace('.meta.json', '.meta.md');
    await fs.writeFile(mdPath, mdContent, 'utf-8');

    // Delete old JSON file
    await fs.unlink(jsonPath);
  }

  /**
   * Migrate all .meta.json files to .meta.md format for all projects
   * @deprecated This method is obsolete after tenant-based reorganization
   */
  async migrateAllMetadata(): Promise<{ totalMigrated: number; projectResults: Record<string, { migrated: number; errors: string[] }> }> {
    const { PATHS } = await import('../config/paths');
    const projectResults: Record<string, { migrated: number; errors: string[] }> = {};
    let totalMigrated = 0;

    try {
      // Read tenant directories
      const tenants = await fs.readdir(PATHS.PROJECTS_DIR, { withFileTypes: true });

      for (const tenant of tenants) {
        if (tenant.isDirectory()) {
          const tenantPath = path.join(PATHS.PROJECTS_DIR, tenant.name);

          // Read project directories within tenant
          try {
            const projects = await fs.readdir(tenantPath, { withFileTypes: true });

            for (const project of projects) {
              if (project.isDirectory()) {
                const result = await this.migrateMetadataFiles(project.name, tenant.name);
                const key = `${tenant.name}/${project.name}`;
                projectResults[key] = result;
                totalMigrated += result.migrated;
              }
            }
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              console.error(`Error reading tenant ${tenant.name}:`, error);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    return { totalMigrated, projectResults };
  }
}
