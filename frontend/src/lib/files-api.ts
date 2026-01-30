/**
 * Files API client
 * Handles HTTP requests for file-related operations
 */

import { buildApiUrl } from "@/lib/base-path";

// Use buildApiUrl to support base path
const API_BASE_URL = buildApiUrl("");

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  url: string;
  thumbnailUrl?: string;
  scope?: string;
  description?: string;
  title?: string;
}

/**
 * Fetch all files for a project
 * @param bustCache - Add timestamp to bust browser cache (default: false)
 */
export async function fetchProjectFiles(
  projectId: string,
  bustCache: boolean = false
): Promise<FileInfo[]> {
  const url = bustCache
    ? `${API_BASE_URL}/api/files?projectId=${projectId}&_t=${Date.now()}`
    : `${API_BASE_URL}/api/files?projectId=${projectId}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch files");
  }

  return data.data.files;
}

/**
 * Fetch files for a specific conversation
 */
export async function fetchConversationFiles(
  convId: string,
  projectId: string
): Promise<FileInfo[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${convId}/files?projectId=${projectId}`
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch conversation files");
  }

  return data.data.files;
}

/**
 * Rename a file
 */
export async function renameFile(
  projectId: string,
  fileName: string,
  newName: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/files/${projectId}/${fileName}/rename`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ newName }),
    }
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to rename file");
  }
}

/**
 * Move a file to a different conversation
 */
export async function moveFile(
  projectId: string,
  fromConvId: string,
  toConvId: string,
  fileName: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/files/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId,
      fromConvId,
      toConvId,
      fileName,
    }),
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to move file");
  }
}

/**
 * Delete a file
 */
export async function deleteFile(
  projectId: string,
  fileName: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/files/${projectId}/${fileName}`,
    {
      method: "DELETE",
    }
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to delete file");
  }
}

/**
 * Format file size to human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Get file icon based on file type
 */
export function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();

  const imageExts = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
  const videoExts = ["mp4", "avi", "mov", "wmv", "flv", "webm"];
  const audioExts = ["mp3", "wav", "ogg", "m4a", "flac"];
  const documentExts = ["pdf", "doc", "docx", "txt", "rtf"];
  const codeExts = ["js", "ts", "tsx", "jsx", "py", "java", "cpp", "c", "html", "css"];

  if (imageExts.includes(ext || "")) return "🖼️";
  if (videoExts.includes(ext || "")) return "🎥";
  if (audioExts.includes(ext || "")) return "🎵";
  if (documentExts.includes(ext || "")) return "📄";
  if (codeExts.includes(ext || "")) return "💻";

  return "📎";
}

/**
 * File context types
 */
export interface FileContextMapping {
  [fileId: string]: boolean;
}

export interface FileContextData {
  fileContext: FileContextMapping;
  version: string;
  updatedAt: number;
}

/**
 * Get file context for a project
 */
export async function getFileContext(
  projectId: string
): Promise<FileContextData> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/file-context`
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch file context");
  }

  return data.data;
}

/**
 * Set file in context
 */
export async function setFileInContext(
  projectId: string,
  fileId: string,
  included: boolean
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/file-context`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileId, included }),
    }
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to set file context");
  }
}

/**
 * Bulk set files in context
 */
export async function bulkSetFilesInContext(
  projectId: string,
  fileIds: string[],
  included: boolean
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/file-context`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileIds, included }),
    }
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to bulk set file context");
  }
}
