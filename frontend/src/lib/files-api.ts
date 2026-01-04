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
  convId: string;
  conversationTitle?: string;
  url: string;
}

/**
 * Fetch all files for a project
 */
export async function fetchProjectFiles(
  projectId: string
): Promise<FileInfo[]> {
  const response = await fetch(`${API_BASE_URL}/api/files?projectId=${projectId}`);
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
 * Delete a file
 */
export async function deleteFile(
  projectId: string,
  convId: string,
  fileName: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/files/${projectId}/${convId}/${fileName}`,
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
