/**
 * Extension Inspector Component
 * Renders extension-specific inspector components based on the extension ID
 */

import { getInspector } from "./extension-inspector-registry";
import type { InspectorComponentProps } from "./extension-inspector-registry";

interface ExtensionInspectorProps {
  extensionId: string;
  data: any;
  error?: string;
}

export function ExtensionInspector({ extensionId, data, error }: ExtensionInspectorProps) {
  const InspectorComponent = getInspector(extensionId);

  if (!InspectorComponent) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No inspector available for extension: <code className="font-mono">{extensionId}</code>
      </div>
    );
  }

  return <InspectorComponent data={data} error={error} />;
}
