/**
 * Image Search Extension UI Components
 * Displays image search results with thumbnails
 */

import React from 'react';

interface InspectorProps {
  data: {
    query?: string;
    results?: Array<{
      title: string;
      url: string;
      thumbnail: {
        src: string;
      };
      source: string;
    }>;
    total?: number;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      results?: Array<{
        title: string;
        url: string;
        thumbnail: {
          src: string;
        };
        source: string;
      }>;
      total?: number;
      query?: string;
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function ImageSearchInspector({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <h4 className="font-semibold mb-2">Error</h4>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || !data.results || data.results.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No image results available
      </div>
    );
  }

  const { query, results, total } = data;

  return (
    <div className="p-4 space-y-4">
      {/* Query Info */}
      {query && (
        <div>
          <h4 className="font-semibold text-sm mb-2">Search Query</h4>
          <p className="text-sm text-muted-foreground">"{query}"</p>
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">Found:</span>
        <span className="text-muted-foreground">{total || results.length} images</span>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {results.map((result, idx) => (
          <div key={idx} className="space-y-2">
            {/* Thumbnail */}
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square overflow-hidden rounded-lg border hover:border-primary transition-colors"
            >
              <img
                src={result.thumbnail.src}
                alt={result.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </a>

            {/* Title */}
            <p className="text-xs line-clamp-2" title={result.title}>
              {result.title}
            </p>

            {/* Source */}
            <p className="text-xs text-muted-foreground">
              {result.source}
            </p>
          </div>
        ))}
      </div>

      {/* Info Badge */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
        🔍 Image Search - Powered by Brave Search API
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function ImageSearchMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;
  const { results, total, query } = result;

  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No images found
      </div>
    );
  }

  // Show first 8 images in chat
  const previewImages = results.slice(0, 8);

  return (
    <div className="space-y-2">
      {/* Query */}
      {query && (
        <div className="text-xs text-muted-foreground">
          "{query}" - {total || results.length} images found
        </div>
      )}

      {/* Image Grid - Compact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {previewImages.map((result, idx) => (
          <a
            key={idx}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-square overflow-hidden rounded border hover:border-primary transition-colors group"
          >
            <img
              src={result.thumbnail.src}
              alt={result.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              loading="lazy"
            />
          </a>
        ))}
      </div>

      {results.length > 8 && (
        <div className="text-xs text-muted-foreground italic">
          Open inspection tab to see all {results.length} images
        </div>
      )}
    </div>
  );
}
