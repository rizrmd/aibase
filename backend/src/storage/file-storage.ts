/**
 * File storage service for handling uploaded files
 * Stores files in /data/[proj-id]/[conv-id]/files/
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface StoredFile {
  name: string;
  size: number;
  type: string;
  path: string;
  uploadedAt: number;
}

export class FileStorage {
  private static instance: FileStorage;
  private baseDir: string;
  private defaultProjectId = 'A1'; // Hardcoded for now

  private constructor() {
    // Use absolute path from project root
    this.baseDir = path.join(process.cwd(), 'data');
  }

  static getInstance(): FileStorage {
    if (!FileStorage.instance) {
      FileStorage.instance = new FileStorage();
    }
    return FileStorage.instance;
  }

  /**
   * Get the directory path for a conversation
   */
  private getConvDir(convId: string, projectId?: string): string {
    const projId = projectId || this.defaultProjectId;
    return path.join(this.baseDir, projId, convId, 'files');
  }

  /**
   * Ensure conversation directory exists
   */
  private async ensureConvDir(convId: string, projectId?: string): Promise<void> {
    const convDir = this.getConvDir(convId, projectId);
    await fs.mkdir(convDir, { recursive: true });
  }

  /**
   * Save a file to disk
   */
  async saveFile(
    convId: string,
    fileName: string,
    fileBuffer: Buffer,
    fileType: string,
    projectId?: string
  ): Promise<StoredFile> {
    const projId = projectId || this.defaultProjectId;
    await this.ensureConvDir(convId, projId);

    // Sanitize filename to prevent directory traversal
    const sanitizedFileName = path.basename(fileName);

    // Add unique ID to prevent overwrites
    const timestamp = Date.now();
    const ext = path.extname(sanitizedFileName);
    const nameWithoutExt = path.basename(sanitizedFileName, ext);
    const uniqueFileName = `${nameWithoutExt}_${timestamp}${ext}`;

    const filePath = path.join(this.getConvDir(convId, projId), uniqueFileName);

    // Write buffer directly to disk
    await fs.writeFile(filePath, fileBuffer);

    // Get file stats
    const stats = await fs.stat(filePath);

    return {
      name: uniqueFileName,
      size: stats.size,
      type: fileType,
      path: filePath,
      uploadedAt: Date.now(),
    };
  }

  /**
   * List all files for a conversation
   */
  async listFiles(convId: string, projectId?: string): Promise<StoredFile[]> {
    const projId = projectId || this.defaultProjectId;
    const convDir = this.getConvDir(convId, projId);

    try {
      const entries = await fs.readdir(convDir, { withFileTypes: true });
      const files: StoredFile[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(convDir, entry.name);
          const stats = await fs.stat(filePath);

          files.push({
            name: entry.name,
            size: stats.size,
            type: '', // Type info not available from filesystem
            path: filePath,
            uploadedAt: stats.mtimeMs,
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
  async getFile(convId: string, fileName: string, projectId?: string): Promise<Buffer> {
    const projId = projectId || this.defaultProjectId;
    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(this.getConvDir(convId, projId), sanitizedFileName);

    return await fs.readFile(filePath);
  }

  /**
   * Delete a file
   */
  async deleteFile(convId: string, fileName: string, projectId?: string): Promise<void> {
    const projId = projectId || this.defaultProjectId;
    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(this.getConvDir(convId, projId), sanitizedFileName);

    await fs.unlink(filePath);
  }

  /**
   * Delete all files for a conversation
   */
  async deleteAllFiles(convId: string, projectId?: string): Promise<void> {
    const projId = projectId || this.defaultProjectId;
    const convDir = this.getConvDir(convId, projId);

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
  async getStorageSize(convId: string, projectId?: string): Promise<number> {
    const files = await this.listFiles(convId, projectId);
    return files.reduce((total, file) => total + file.size, 0);
  }
}
