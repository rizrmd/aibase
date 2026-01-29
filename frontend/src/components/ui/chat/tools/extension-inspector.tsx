/**
 * Extension Inspector Component
 * Renders extension-specific inspector components based on the extension ID
 * Enhanced with error boundaries, retry mechanism, and better loading states
 */

import { useEffect, useState, useCallback } from "react";
import { getInspector } from "./extension-inspector-registry";
import type { ComponentType } from "react";
import type { InspectorComponentProps } from "./extension-inspector-registry";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";

interface ExtensionInspectorProps {
  extensionId: string;
  data: any;
  error?: string;
}

/**
 * Error boundary fallback component
 */
function InspectorErrorBoundary({
  extensionId,
  error,
  onRetry
}: {
  extensionId: string;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-destructive mb-1">Inspector Error</h4>
          <p className="text-sm text-muted-foreground mb-2">{error}</p>
          <p className="text-xs text-muted-foreground">
            Extension: <code className="font-mono">{extensionId}</code>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="flex-shrink-0"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      </div>
    </div>
  );
}

/**
 * Enhanced loading skeleton
 */
function InspectorLoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="space-y-2">
        <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
        <div className="h-20 bg-muted animate-pulse rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-muted animate-pulse rounded w-1/4" />
        <div className="h-24 bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}

export function ExtensionInspector({ extensionId, data, error }: ExtensionInspectorProps) {
  const currentProject = useProjectStore((state) => state.currentProject);
  const [InspectorComponent, setInspectorComponent] = useState<ComponentType<InspectorComponentProps> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const loadInspector = useCallback(async () => {
    let cancelled = false;

    try {
      setLoading(true);
      setLoadError(null);

      const component = await getInspector(
        extensionId,
        currentProject?.id,
        currentProject?.tenant_id !== null && currentProject?.tenant_id !== undefined
          ? String(currentProject.tenant_id)
          : undefined
      );

      if (!cancelled) {
        if (component) {
          setInspectorComponent(() => component);
        } else {
          setLoadError(`No inspector component available for "${extensionId}"`);
        }
      }
    } catch (err) {
      if (!cancelled) {
        console.error(`[ExtensionInspector] Failed to load inspector for ${extensionId}:`, err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setLoadError(`Failed to load inspector: ${errorMessage}`);
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [extensionId, currentProject?.id, currentProject?.tenant_id]);

  useEffect(() => {
    loadInspector();
  }, [loadInspector, retryCount]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
  }, []);

  // Show loading skeleton
  if (loading) {
    return <InspectorLoadingSkeleton />;
  }

  // Show load error with retry button
  if (loadError) {
    return <InspectorErrorBoundary extensionId={extensionId} error={loadError} onRetry={handleRetry} />;
  }

  // No inspector available
  if (!InspectorComponent) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        No inspector available for extension: <code className="font-mono">{extensionId}</code>
      </div>
    );
  }

  // Render inspector with error boundary
  try {
    return <InspectorComponent data={data} error={error} />;
  } catch (err) {
    console.error(`[ExtensionInspector] Error rendering inspector for ${extensionId}:`, err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown rendering error';
    return (
      <InspectorErrorBoundary
        extensionId={extensionId}
        error={`Rendering error: ${errorMessage}`}
        onRetry={handleRetry}
      />
    );
  }
}
