/**
 * Show Mermaid Extension UI Components
 * Displays Mermaid diagram code and metadata
 */

import React from 'react';

interface InspectorProps {
  data: {
    title?: string;
    description?: string;
    code?: string;
  };
  error?: string;
}

interface MessageProps {
  toolInvocation: {
    result: {
      args: {
        title?: string;
        description?: string;
        code?: string;
      };
    };
  };
}

/**
 * Inspection Dialog UI - default export
 * Full-featured UI for the inspection dialog
 */
export default function ShowMermaidInspector({ data, error }: InspectorProps) {
  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        <h4 className="font-semibold mb-2">Error</h4>
        <p>{error}</p>
      </div>
    );
  }

  if (!data || !data.code) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No diagram code available
      </div>
    );
  }

  const { title, description, code } = data;

  return (
    <div className="p-4 space-y-4">
      {/* Title and Description */}
      {title && (
        <div>
          <h4 className="font-semibold text-base mb-1">{title}</h4>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}

      {/* Diagram Type */}
      <div className="text-sm">
        <span className="font-semibold">Type:</span>{' '}
        <span className="text-muted-foreground">
          {code.includes('graph TD') || code.includes('graph LR')
            ? 'Flowchart'
            : code.includes('sequenceDiagram')
            ? 'Sequence Diagram'
            : code.includes('classDiagram')
            ? 'Class Diagram'
            : code.includes('stateDiagram')
            ? 'State Diagram'
            : code.includes('erDiagram')
            ? 'Entity Relationship Diagram'
            : code.includes('gantt')
            ? 'Gantt Chart'
            : code.includes('pie')
            ? 'Pie Chart'
            : 'Mermaid Diagram'}
        </span>
      </div>

      {/* Code */}
      <div>
        <h4 className="font-semibold text-sm mb-2">Diagram Code</h4>
        <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
          {code}
        </pre>
      </div>

      {/* Info Badge */}
      <div className="p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded text-xs text-indigo-800 dark:text-indigo-200">
        🎨 Mermaid Diagram - Text-to-diagram rendering (use chat for visualization)
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
 *
 * Note: This is a placeholder that shows diagram metadata.
 * The actual diagram rendering happens in the frontend visualization component.
 */
export function ShowMermaidMessage({ toolInvocation }: MessageProps) {
  const { title, description, code } = toolInvocation.result.args;

  if (!code) {
    return (
      <div className="text-sm text-muted-foreground">
        No diagram code available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
      {/* Title and Description */}
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Code Preview */}
      <div>
        <p className="text-xs font-medium mb-1 text-muted-foreground">Diagram Code:</p>
        <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">
          {code}
        </pre>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground italic">
        Diagram rendering is handled by the frontend visualization component
      </div>
    </div>
  );
}
