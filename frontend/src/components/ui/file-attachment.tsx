import {
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

import type { UploadedFileAttachment } from "./chat";

interface FileAttachmentProps {
  file: UploadedFileAttachment;
  className?: string;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  if (
    type.includes("pdf") ||
    type.includes("document") ||
    type.includes("text")
  )
    return FileText;
  if (
    type.includes("javascript") ||
    type.includes("typescript") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("html")
  )
    return FileCode;
  if (
    type.includes("zip") ||
    type.includes("rar") ||
    type.includes("tar") ||
    type.includes("gz")
  )
    return FileArchive;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function FileAttachment({ file, className }: FileAttachmentProps) {
  const Icon = getFileIcon(file.type);
  const hasProcessingStatus =
    file.processingStatus && file.processingStatus.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {hasProcessingStatus ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
        ) : (
          <Icon className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
              {file.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-600 dark:text-blue-400">
              {formatFileSize(file.size)}
            </span>
            {hasProcessingStatus && (
              <>
                <span className="text-xs text-blue-400">•</span>
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  {file.processingStatus}
                </span>
              </>
            )}
            {file.timeElapsed !== undefined && file.timeElapsed >= 0 && (
              <>
                <span className="text-xs text-blue-400">•</span>
                <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                  {file.timeElapsed}s
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface FileAttachmentListProps {
  files: UploadedFileAttachment[];
  className?: string;
}

export function FileAttachmentList({
  files,
  className,
}: FileAttachmentListProps) {
  if (!files || files.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {files.map((file) => (
        <FileAttachment key={file.id} file={file} />
      ))}
    </div>
  );
}
