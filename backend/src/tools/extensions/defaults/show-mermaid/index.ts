/**
 * Show Mermaid Extension
 * Display Mermaid diagrams in the frontend
 */

// Type definitions
interface ShowMermaidOptions {
  title: string;
  code: string;
}

interface ShowMermaidResult {
  __visualization: {
    type: string;
    toolCallId: string;
    args: ShowMermaidOptions;
  };
}

/**
 * Context documentation for the show-mermaid extension
 */
const context = () =>
  '' +
  '### Show Mermaid Extension' +
  '' +
  'Display Mermaid diagrams in the chat interface.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### showMermaid(options)' +
  'Display a Mermaid diagram.' +
  '`' + '`' + '`' + 'typescript' +
  'await showMermaid({' +
  '  title: "Decision Flow",' +
  '  code: \\`graph TD' +
  '    A[Start] --> B{Decision}' +
  '    B -->|Yes| C[Action 1]' +
  '    B -->|No| D[Action 2]' +
  '    C --> E[End]' +
  '    D --> E\\`' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`title\\` (required): Diagram title' +
  '- \\`code\\` (required): Mermaid diagram syntax' +
  '' +
  '**Supported Diagram Types:**' +
  '- Flowcharts: \\`graph TD\\` or \\`graph LR\\`' +
  '- Sequence diagrams: \\`sequenceDiagram\\`' +
  '- Class diagrams: \\`classDiagram\\`' +
  '- State diagrams: \\`stateDiagram-v2\\`' +
  '- Entity Relationship: \\`erDiagram\\`' +
  '- Gantt charts: \\`gantt\\`' +
  '- Pie charts: \\`pie\\`' +
  '- And more...' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Flowchart:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showMermaid({' +
  '  title: "User Registration Flow",' +
  '  code: \\`graph TD' +
  '    A[User] --> B{Registered?}' +
  '    B -->|No| C[Create Account]' +
  '    B -->|Yes| D[Login]' +
  '    C --> E[Dashboard]' +
  '    D --> E\\`' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '2. **Sequence Diagram:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showMermaid({' +
  '  title: "API Request Flow",' +
  '  code: \\`sequenceDiagram' +
  '    User->>API: Request' +
  '    API->>Database: Query' +
  '    Database-->>API: Results' +
  '    API-->>User: Response\\`' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '3. **ER Diagram:**' +
  '`' + '`' + '`' + 'typescript' +
  'await showMermaid({' +
  '  title: "Database Schema",' +
  '  code: \\`erDiagram' +
  '    CUSTOMER ||--o{ ORDER : places' +
  '    ORDER ||--|{ LINE_ITEM : contains' +
  '    PRODUCT ||--o{ LINE_ITEM : "ordered in"\\`' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Diagrams render interactively in the chat interface' +
  '- Use valid Mermaid syntax' +
  '- Return the result directly to display the diagram' +
  '- Reference: https://mermaid.js.org/intro/';

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
  showMermaid: async (args: ShowMermaidOptions): Promise<ShowMermaidResult> => {
    // Return visualization metadata directly
    // ScriptRuntime will collect this into __visualizations array
    const toolCallId = `viz_mermaid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
      __visualization: {
        type: "show-mermaid",
        toolCallId,
        args
      }
    };
  },
};

// @ts-expect-error - Extension loader wraps this code in an async function
return showMermaidExtension;
