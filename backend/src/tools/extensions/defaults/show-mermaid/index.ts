/**
 * Show Mermaid Extension
 * Display Mermaid diagrams in the frontend
 */

/**
 * Show mermaid extension
 */
const showMermaidExtension = {
  /**
   * Display Mermaid diagram
   *
   * Usage:
   * await showMermaid({
   *   title: 'Decision Flow',
   *   code: 'graph TD\n    A[Start] --> B[End]'
   * });
   */
  showMermaid: async (args) => {
    const toolCallId = `call_${Date.now()}_mermaid`;

    return {
      __visualization: {
        type: "show-mermaid",
        toolCallId,
        args
      }
    };
  },
};

return showMermaidExtension;
