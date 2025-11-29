import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * File Tool - Built-in file operations
 * Actions: list, info, delete, rename
 */
export class FileTool extends Tool {
  name = "file";
  description = "Perform file operations: list files in directory, get file info, delete file, or rename/move file";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "info", "delete", "rename"],
        description: "The action to perform",
      },
      path: {
        type: "string",
        description: "File or directory path",
      },
      newPath: {
        type: "string",
        description: "New path for rename action (required only for rename)",
      },
    },
    required: ["action", "path"],
  };

  async execute(args: {
    action: "list" | "info" | "delete" | "rename";
    path: string;
    newPath?: string;
  }): Promise<string> {
    try {
      switch (args.action) {
        case "list":
          return await this.listFiles(args.path);
        case "info":
          return await this.getFileInfo(args.path);
        case "delete":
          return await this.deleteFile(args.path);
        case "rename":
          if (!args.newPath) {
            throw new Error("newPath is required for rename action");
          }
          return await this.renameFile(args.path, args.newPath);
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error: any) {
      throw new Error(`File operation failed: ${error.message}`);
    }
  }

  private async listFiles(dirPath: string): Promise<string> {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      path: path.join(dirPath, entry.name),
    }));

    return JSON.stringify(
      {
        directory: dirPath,
        count: files.length,
        entries: files,
      },
      null,
      2
    );
  }

  private async getFileInfo(filePath: string): Promise<string> {
    const stats = await fs.stat(filePath);

    return JSON.stringify(
      {
        path: filePath,
        name: path.basename(filePath),
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
    const stats = await fs.stat(filePath);

    if (stats.isDirectory()) {
      await fs.rmdir(filePath, { recursive: true });
      return JSON.stringify({
        success: true,
        message: `Directory deleted: ${filePath}`,
        path: filePath,
      });
    } else {
      await fs.unlink(filePath);
      return JSON.stringify({
        success: true,
        message: `File deleted: ${filePath}`,
        path: filePath,
      });
    }
  }

  private async renameFile(oldPath: string, newPath: string): Promise<string> {
    await fs.rename(oldPath, newPath);
    return JSON.stringify({
      success: true,
      message: `Renamed: ${oldPath} -> ${newPath}`,
      oldPath,
      newPath,
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
