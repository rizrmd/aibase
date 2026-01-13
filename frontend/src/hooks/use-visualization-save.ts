/**
 * Hook for auto-saving visualizations when rendered
 */

import { useEffect, useRef } from 'react';
import { ConvIdManager } from '@/lib/conv-id';
import { useProjectStore } from '@/stores/project-store';
import { saveVisualizationAsPNG } from '@/lib/image-save';

interface UseVisualizationSaveOptions {
  toolCallId: string;
  saveTo?: string;
  shouldSave: boolean;
}

export function useVisualizationSave({
  toolCallId,
  saveTo,
  shouldSave,
}: UseVisualizationSaveOptions) {
  const hasSavedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const { currentProject } = useProjectStore();

  useEffect(() => {
    // Only save if saveTo is provided and we haven't saved yet
    if (!shouldSave || !saveTo || hasSavedRef.current || !currentProject?.id) {
      return;
    }

    // Small delay to ensure rendering is complete
    timeoutRef.current = setTimeout(async () => {
      try {
        // Find the visualization container by toolCallId
        const container = document.querySelector(`[data-tool-call-id="${toolCallId}"]`) as HTMLElement;

        if (!container) {
          console.warn(`[Visualization Save] Container not found for toolCallId: ${toolCallId}`);
          return;
        }

        const convId = ConvIdManager.getConvId();
        const projectId = currentProject.id;

        console.log(`[Visualization Save] Saving ${saveTo} for toolCallId: ${toolCallId}`);

        const savedFile = await saveVisualizationAsPNG({
          element: container,
          filename: saveTo,
          convId,
          projectId,
        });

        console.log(`[Visualization Save] Saved successfully:`, savedFile.url);
        hasSavedRef.current = true;

      } catch (error) {
        console.error('[Visualization Save] Failed to save:', error);
      }
    }, 500); // 500ms delay to ensure rendering is complete

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [toolCallId, saveTo, shouldSave, currentProject?.id]);
}
