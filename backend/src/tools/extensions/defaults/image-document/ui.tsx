/**
 * Image Document Extension UI Components
 * Displays uploaded images with AI-generated descriptions
 */

interface InspectorProps {
  data: {
    filePath?: string;
    fileId?: string;
    fileName?: string;
    description?: string;
    prompt?: string;
    model?: string;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      args?: {
        filePath?: string;
        fileId?: string;
        prompt?: string;
      };
      description?: string;
      model?: string;
      filePath?: string;
      fileId?: string;
    };
  };
}

/**
 * Get image URL from file path or ID
 */
function getImageUrl(filePath?: string, fileId?: string): string {
  if (fileId) {
    // Return file API URL
    return `/api/files/${fileId}`;
  }
  if (filePath) {
    // Return file path (might be relative or absolute)
    return filePath;
  }
  return '';
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function ImageDocumentInspector({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <h4 className="font-semibold mb-2">Error</h4>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No image data available
      </div>
    );
  }

  const { filePath, fileId, fileName, description, prompt, model } = data;
  const imageUrl = getImageUrl(filePath, fileId);

  return (
    <div className="p-4 space-y-4">
      {/* File Name */}
      {fileName && (
        <div>
          <h4 className="font-semibold text-sm mb-2">File</h4>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>
      )}

      {/* Image Display */}
      {imageUrl && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Image</h4>
          <div className="rounded-lg border overflow-hidden">
            <img
              src={imageUrl}
              alt={fileName || 'Uploaded image'}
              className="w-full max-h-[600px] object-contain bg-muted"
            />
          </div>
        </div>
      )}

      {/* AI-Generated Description */}
      {description && (
        <div>
          <h4 className="font-semibold text-sm mb-2">AI Analysis</h4>
          <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200">
            <p className="whitespace-pre-wrap">{description}</p>
          </div>
        </div>
      )}

      {/* Analysis Details */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {prompt && (
          <div>
            <span className="font-semibold">Prompt:</span>
            <p className="text-muted-foreground text-xs mt-1 line-clamp-3">{prompt}</p>
          </div>
        )}
        {model && (
          <div>
            <span className="font-semibold">Model:</span>
            <p className="text-muted-foreground text-xs mt-1">{model}</p>
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {fileId && (
          <div>
            <span className="font-semibold">File ID:</span>
            <p className="text-muted-foreground text-xs font-mono mt-1">{fileId}</p>
          </div>
        )}
        {filePath && (
          <div>
            <span className="font-semibold">Path:</span>
            <p className="text-muted-foreground text-xs font-mono mt-1 line-clamp-1">{filePath}</p>
          </div>
        )}
      </div>

      {/* Info Badge */}
      <div className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded text-xs text-purple-800 dark:text-purple-200">
        🖼️ Image Document - AI-powered image analysis with vision models
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function ImageDocumentMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;
  const { args, description, model } = result;

  const filePath = result.filePath || args?.filePath;
  const fileId = result.fileId || args?.fileId;
  const fileName = result.fileName;

  const imageUrl = getImageUrl(filePath, fileId);

  if (!imageUrl && !description) {
    return (
      <div className="text-sm text-muted-foreground">
        No image data available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      {/* Image Display */}
      {imageUrl && (
        <div className="rounded-lg border overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt={fileName || 'Uploaded image'}
            className="w-full max-h-[400px] object-contain"
          />
        </div>
      )}

      {/* Description */}
      {description && (
        <div className="text-sm">
          <p className="whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {fileName && <span>📄 {fileName}</span>}
        {model && <span>🤖 {model}</span>}
      </div>
    </div>
  );
}
