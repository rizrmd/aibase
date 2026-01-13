import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useVisualizationSave } from "@/hooks/use-visualization-save";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";

interface MermaidToolProps {
  toolInvocation: {
    toolName: string;
    toolCallId: string;
    args: {
      title: string;
      code: string;
      description?: string;
      saveTo?: string;
    };
    result?: any;
  };
}

export function MermaidTool({ toolInvocation }: MermaidToolProps) {
  const { title, description, code, saveTo } = toolInvocation.args;
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    // Initialize Mermaid on mount
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });

    const renderDiagram = async () => {
      try {
        console.log('[MermaidTool] Starting render for toolCallId:', toolInvocation.toolCallId);
        console.log('[MermaidTool] Code:', code);
        setIsLoading(true);
        setError(null);
        setIsRendered(false);

        // Generate a unique ID for this diagram
        const id = `mermaid-${toolInvocation.toolCallId}`;

        // Check if the diagram is valid
        const valid = await mermaid.parse(code);
        console.log('[MermaidTool] Parse result:', valid);
        if (!valid) {
          throw new Error("Invalid Mermaid syntax");
        }

        // Render the diagram
        const { svg } = await mermaid.render(id, code);
        console.log('[MermaidTool] SVG generated, length:', svg?.length);

        // Use React's state to set the SVG content
        setSvgContent(svg);
        setIsLoading(false);
        setIsRendered(true);
        console.log('[MermaidTool] Render complete, isRendered set to true');
      } catch (err: any) {
        console.error("[MermaidTool] Rendering error:", err);
        setError(err.message || "Failed to render diagram");
        setIsLoading(false);
        setIsRendered(false);
      }
    };

    renderDiagram();
  }, [code, toolInvocation.toolCallId]);

  // Auto-save AFTER diagram is rendered
  useVisualizationSave({
    toolCallId: toolInvocation.toolCallId,
    saveTo,
    shouldSave: !!saveTo && isRendered && !isLoading && !error, // Only save after rendering is complete and successful
  });

  return (
    <div
      ref={rootRef}
      data-tool-call-id={toolInvocation.toolCallId}
      className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="min-h-[200px] w-full overflow-auto flex items-center justify-center bg-background rounded-lg border relative group cursor-pointer" onClick={() => !isLoading && !error && setIsLightboxOpen(true)}>
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
          <div className="hover:opacity-90 transition-opacity">
            <div dangerouslySetInnerHTML={{ __html: svgContent }} />
          </div>
        )}

        {svgContent && !isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-lg pointer-events-none">
            <Maximize2 className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <h3 className="font-semibold text-lg">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex-1 overflow-auto p-6 bg-background flex items-center justify-center">
            {svgContent && (
              <div
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: svgContent }}
                style={{
                  fontSize: '16px',
                  lineHeight: '1.5'
                }}
                ref={(el) => {
                  if (el) {
                    const svg = el.querySelector('svg');
                    if (svg) {
                      svg.style.width = '100%';
                      svg.style.height = 'auto';
                      svg.style.maxHeight = '100%';
                    }
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
