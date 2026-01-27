/**
 * Show Mermaid Extension UI Components
 * Displays Mermaid diagrams (using window.libs.mermaid from frontend)
 */

// Get React hooks and mermaid from window.libs (loaded by frontend)
declare const window: {
  libs: {
    React: any;
    ReactDOM: any;
    mermaid: any;
  };
};

const { useEffect, useState, useRef } = window.libs.React;
const mermaid = window.libs.mermaid;

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
 * Mermaid Diagram Component
 */
function MermaidDiagram({ code }: { code: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Mermaid on mount
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    });

    const renderDiagram = async () => {
      try {
        console.log('[MermaidDiagram] Starting render');
        setIsLoading(true);
        setError(null);

        // Generate a unique ID for this diagram
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Check if the diagram is valid
        const valid = await mermaid.parse(code);
        if (!valid) {
          throw new Error('Invalid Mermaid syntax');
        }

        // Render the diagram
        const { svg } = await mermaid.render(id, code);
        console.log('[MermaidDiagram] SVG generated');

        setSvgContent(svg);
        setIsLoading(false);
      } catch (err: any) {
        console.error('[MermaidDiagram] Rendering error:', err);
        setError(err.message || 'Failed to render diagram');
        setIsLoading(false);
      }
    };

    renderDiagram();
  }, [code]);

  return (
    <div className="min-h-[200px] w-full overflow-auto flex items-center justify-center bg-background rounded-lg border">
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span className="text-sm">Rendering diagram...</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-2 text-destructive">
          <p className="text-sm font-medium">Failed to render diagram</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}

      {svgContent && !isLoading && !error && (
        <div dangerouslySetInnerHTML={{ __html: svgContent }} />
      )}
    </div>
  );
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

      {/* Diagram Rendering */}
      <MermaidDiagram code={code} />

      {/* Code */}
      <div>
        <h4 className="font-semibold text-sm mb-2">Diagram Code</h4>
        <pre className="p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
          {code}
        </pre>
      </div>

      {/* Info Badge */}
      <div className="p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded text-xs text-indigo-800 dark:text-indigo-200">
        🎨 Mermaid Diagram - Text-to-diagram rendering from backend plugin
      </div>
    </div>
  );
}

/**
 * Message Chat UI - named export
 * Simplified UI for inline rendering in chat messages
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

      {/* Diagram Rendering */}
      <MermaidDiagram code={code} />
    </div>
  );
}
