/**
 * Web Search Extension UI Components
 * Displays web search results with descriptions
 */

import React from 'react';

interface SearchResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  meta_url?: {
    favicon?: string;
  };
}

interface InspectorProps {
  data: {
    query?: string;
    results?: SearchResult[];
    total?: number;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      results?: SearchResult[];
      total?: number;
      query?: string;
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function WebSearchInspector({ data, error }: InspectorProps) {
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
        No search results available
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
        <span className="text-muted-foreground">{total || results.length} results</span>
      </div>

      {/* Search Results List */}
      <div className="space-y-4">
        {results.map((result, idx) => (
          <div key={idx} className="space-y-2 pb-4 border-b last:border-0">
            {/* Title & URL */}
            <div className="space-y-1">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                {result.meta_url?.favicon && (
                  <img
                    src={result.meta_url.favicon}
                    alt=""
                    className="w-4 h-4 flex-shrink-0"
                  />
                )}
                <span className="truncate">{result.title || result.url}</span>
              </a>
              <p className="text-xs text-green-700 dark:text-green-400 font-mono truncate">
                {result.url}
              </p>
            </div>

            {/* Description */}
            {result.description && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {result.description}
              </p>
            )}

            {/* Age */}
            {result.age && (
              <p className="text-xs text-muted-foreground">
                {result.age}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Info Badge */}
      <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
        🔍 Web Search - Powered by Brave Search API
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 */
export function WebSearchMessage({ toolInvocation }: MessageProps) {
  const { result } = toolInvocation;
  const { results, total, query } = result;

  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No results found
      </div>
    );
  }

  // Show first 5 results in chat
  const previewResults = results.slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Query */}
      {query && (
        <div className="text-xs text-muted-foreground">
          "{query}" - {total || results.length} results found
        </div>
      )}

      {/* Results List - Compact */}
      <div className="space-y-3">
        {previewResults.map((result, idx) => (
          <div key={idx} className="space-y-1">
            {/* Title & URL */}
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {result.meta_url?.favicon && (
                <img
                  src={result.meta_url.favicon}
                  alt=""
                  className="w-3 h-3 flex-shrink-0"
                />
              )}
              <span className="truncate">{result.title || result.url}</span>
            </a>

            {/* URL */}
            <p className="text-xs text-green-700 dark:text-green-400 font-mono truncate">
              {result.url}
            </p>

            {/* Description */}
            {result.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {result.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {results.length > 5 && (
        <div className="text-xs text-muted-foreground italic">
          Open inspection tab to see all {results.length} results
        </div>
      )}
    </div>
  );
}
