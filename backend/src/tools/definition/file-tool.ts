import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * File Tool - Built-in file operations
 * Actions: list, info, delete, rename, uploadUrl
 * All operations are restricted to /data/{proj-id}/{conv-id}/files/ pattern
 */
export class FileTool extends Tool {
  name = "file";
  description = "Perform file operations: list files in directory, get file info, delete file, rename/move file, or upload file from URL. All paths are relative to the project directory (/data/{proj-id}/) and must be within {conv-id}/files/ subdirectories.";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "info", "delete", "rename", "uploadUrl"],
        description: "The action to perform",
      },
      path: {
        type: "string",
        description: "File or directory path relative to project directory (must be within {conv-id}/files/ subdirectories). For list action, defaults to listing all files across all conversations if not specified. For uploadUrl, this is the destination filename.",
      },
      newPath: {
        type: "string",
        description: "New path for rename action (required only for rename)",
      },
      url: {
        type: "string",
        description: "URL to download file from (required only for uploadUrl action)",
      },
    },
    required: ["action"],
  };

  private convId: string = "default";
  private projectId: string = "A1";

  /**
   * Set the conversation ID for this tool instance
   */
  setConvId(convId: string): void {
    this.convId = convId;
  }

  /**
   * Set the project ID for this tool instance
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * Get the base directory for file operations
   */
  private getBaseDir(): string {
    return path.join(process.cwd(), "data", this.projectId);
  }

  /**
   * Resolve and validate a path within the base directory
   * Ensures path matches /data/{proj-id}/{conv-id}/files/ pattern
   */
  private async resolvePath(userPath: string): Promise<string> {
    const baseDir = this.getBaseDir();

    // Ensure base directory exists
    await fs.mkdir(baseDir, { recursive: true });

    // Resolve the user path relative to base directory
    const resolvedPath = path.resolve(baseDir, userPath);

    // Security check: ensure resolved path is within base directory
    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error("Access denied: Path is outside allowed directory");
    }

    // Validate that path matches {conv-id}/files/ pattern
    const relativePath = path.relative(baseDir, resolvedPath);
    const pathParts = relativePath.split(path.sep);

    // Path should be: {conv-id}/files/{filename}
    // So we need at least 2 parts, and second part must be "files"
    if (pathParts.length < 2 || pathParts[1] !== "files") {
      throw new Error("Access denied: Path must be within {conv-id}/files/ subdirectories");
    }

    return resolvedPath;
  }

  async execute(args: {
    action: "list" | "info" | "delete" | "rename" | "uploadUrl";
    path?: string;
    newPath?: string;
    url?: string;
  }): Promise<string> {
    try {
      switch (args.action) {
        case "list":
          return await this.listFiles(args.path);
        case "info":
          if (!args.path) {
            throw new Error("path is required for info action");
          }
          return await this.getFileInfo(args.path);
        case "delete":
          if (!args.path) {
            throw new Error("path is required for delete action");
          }
          return await this.deleteFile(args.path);
        case "rename":
          if (!args.path) {
            throw new Error("path is required for rename action");
          }
          if (!args.newPath) {
            throw new Error("newPath is required for rename action");
          }
          return await this.renameFile(args.path, args.newPath);
        case "uploadUrl":
          if (!args.url) {
            throw new Error("url is required for uploadUrl action");
          }
          if (!args.path) {
            throw new Error("path is required for uploadUrl action (destination filename)");
          }
          return await this.uploadFromUrl(args.url, args.path);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error: any) {
      throw new Error(`File operation failed: ${error.message}`);
    }
  }

  private async listFiles(dirPath?: string): Promise<string> {
    const baseDir = this.getBaseDir();

    // If no path provided, list all files in all */files/* directories
    if (!dirPath) {
      return await this.listAllProjectFiles();
    }

    // If path provided, list files in that specific directory
    const resolvedPath = await this.resolvePath(dirPath);
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const files = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      path: path.relative(baseDir, path.join(resolvedPath, entry.name)),
    }));

    return JSON.stringify(
      {
        directory: path.relative(baseDir, resolvedPath),
        baseDirectory: baseDir,
        count: files.length,
        entries: files,
      },
      null,
      2
    );
  }

  private async listAllProjectFiles(): Promise<string> {
    const baseDir = this.getBaseDir();
    await fs.mkdir(baseDir, { recursive: true });

    const allFiles: any[] = [];

    try {
      // List all conversation directories in the project
      const entries = await fs.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const convId = entry.name;
        const filesDir = path.join(baseDir, convId, "files");

        // Check if files directory exists for this conversation
        try {
          await fs.access(filesDir);
          const stats = await fs.stat(filesDir);

          if (stats.isDirectory()) {
            // Recursively list all files in this conversation's files directory
            const files = await this.listFilesRecursive(filesDir, baseDir);
            allFiles.push(...files);
          }
        } catch (error) {
          // Files directory doesn't exist for this conversation, skip it
          continue;
        }
      }

      return JSON.stringify(
        {
          baseDirectory: baseDir,
          totalFiles: allFiles.length,
          files: allFiles,
        },
        null,
        2
      );
    } catch (error) {
      throw new Error(`Failed to list files: ${(error as Error).message}`);
    }
  }

  private async listFilesRecursive(dirPath: string, baseDir: string): Promise<any[]> {
    const files: any[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        // Recursively list files in subdirectories
        const subFiles = await this.listFilesRecursive(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        const stats = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          size: stats.size,
          sizeHuman: this.formatBytes(stats.size),
          modified: stats.mtime.toISOString(),
        });
      }
    }

    return files;
  }

  private async getFileInfo(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const stats = await fs.stat(resolvedPath);

    return JSON.stringify(
      {
        path: path.relative(baseDir, resolvedPath),
        name: path.basename(resolvedPath),
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
        sizeHuman: this.formatBytes(stats.size),
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        permissions: stats.mode.toString(8).slice(-3),
      },
      null,
      2
    );
  }

  private async deleteFile(filePath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(filePath);
    const baseDir = this.getBaseDir();
    const stats = await fs.stat(resolvedPath);
    const relativePath = path.relative(baseDir, resolvedPath);

    if (stats.isDirectory()) {
      await fs.rm(resolvedPath, { recursive: true });
      return JSON.stringify({
        success: true,
        message: `Directory deleted: ${relativePath}`,
        path: relativePath,
      });
    } else {
      await fs.unlink(resolvedPath);
      return JSON.stringify({
        success: true,
        message: `File deleted: ${relativePath}`,
        path: relativePath,
      });
    }
  }

  private async renameFile(oldPath: string, newPath: string): Promise<string> {
    const resolvedOldPath = await this.resolvePath(oldPath);
    const resolvedNewPath = await this.resolvePath(newPath);
    const baseDir = this.getBaseDir();

    await fs.rename(resolvedOldPath, resolvedNewPath);

    const relativeOldPath = path.relative(baseDir, resolvedOldPath);
    const relativeNewPath = path.relative(baseDir, resolvedNewPath);

    return JSON.stringify({
      success: true,
      message: `Renamed: ${relativeOldPath} -> ${relativeNewPath}`,
      oldPath: relativeOldPath,
      newPath: relativeNewPath,
    });
  }

  private async uploadFromUrl(url: string, destPath: string): Promise<string> {
    const resolvedPath = await this.resolvePath(destPath);
    const baseDir = this.getBaseDir();
    const relativePath = path.relative(baseDir, resolvedPath);

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Download file from URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.status} ${response.statusText}`);
    }

    // Get content as buffer
    const buffer = await response.arrayBuffer();
    const nodeBuffer = Buffer.from(buffer);

    // Write to file
    await fs.writeFile(resolvedPath, nodeBuffer);

    // Get file stats
    const stats = await fs.stat(resolvedPath);

    return JSON.stringify({
      success: true,
      message: `File uploaded from URL to: ${relativePath}`,
      url,
      path: relativePath,
      name: path.basename(resolvedPath),
      size: stats.size,
      sizeHuman: this.formatBytes(stats.size),
      created: stats.birthtime.toISOString(),
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}
