/**
 * HTTP file upload utility
 * Uses standard multipart/form-data for efficient file uploads
 */

import { buildApiUrl } from "@/lib/base-path";

const UPLOAD_ENDPOINT = `${buildApiUrl("")}/api/upload`;

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  projectId: string; // Required project ID
  convId?: string; // Conversation ID for status broadcasts
}

/**
 * Upload files using HTTP multipart/form-data
 */
export async function uploadFiles(
  files: File[],
  options: UploadOptions
): Promise<UploadedFile[]> {
  const projectId = options.projectId;
  const formData = new FormData();

  // Add all files to form data
  for (const file of files) {
    formData.append("files", file);
  }

  // Build URL query params manually
  const params = new URLSearchParams();
  params.append("projectId", projectId);
  if (options.convId) {
    params.append("convId", options.convId);
  }

  const url = `${UPLOAD_ENDPOINT}?${params.toString()}`;

  try {
    // Use fetch with AbortSignal for cancellation support
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Upload failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    return result.files;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Upload cancelled");
      }
      throw error;
    }
    throw new Error("Upload failed");
  }
}

/**
 * Upload files with progress tracking using XMLHttpRequest
 * (fetch doesn't support upload progress natively)
 */
export function uploadFilesWithProgress(
  files: File[],
  options: UploadOptions
): Promise<UploadedFile[]> {
  return new Promise((resolve, reject) => {
    const projectId = options.projectId;
    const formData = new FormData();

    for (const file of files) {
      formData.append("files", file);
    }

    // Build URL query params manually
    const params = new URLSearchParams();
    params.append("projectId", projectId);
    if (options.convId) {
      params.append("convId", options.convId);
    }

    const url = `${UPLOAD_ENDPOINT}?${params.toString()}`;
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    // Handle completion
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          if (result.success) {
            resolve(result.files);
          } else {
            reject(new Error(result.error || "Upload failed"));
          }
        } catch (error) {
          reject(new Error("Failed to parse response"));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    // Handle errors
    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    // Support abort signal
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        xhr.abort();
      });
    }

    xhr.open("POST", url);
    xhr.send(formData);
  });
}

/**
 * Get file URL for display/download
 */
export function getFileUrl(fileName: string, projectId: string): string {
  return `${buildApiUrl("")}/api/files/${projectId}/${fileName}`;
}
