/**
 * Context documentation for showMermaid functionality
 */
export const context = async () => {
  return `### SHOW MERMAID

**IMPORTANT: \`showMermaid\` is a script tool function available in your script execution environment, NOT a direct tool.**

You call \`showMermaid()\` directly within your TypeScript/JavaScript code - it is NOT invoked via tool use. Just use it like a regular async function.

Use showMermaid() to display Mermaid diagrams in the frontend.

**Available:** showMermaid({ title, code, description?, saveTo? })

#### PARAMETERS

- title: Diagram title (required)
- code: Mermaid diagram code (required) - see https://mermaid.js.org/intro/ for syntax
- description: Optional diagram description
- saveTo: Optional filename to save diagram as PNG (e.g., 'flowchart.png')

#### DIAGRAM TYPES SUPPORTED

- Flowcharts: \`graph TD\` or \`graph LR\`
- Sequence diagrams: \`sequenceDiagram\`
- Class diagrams: \`classDiagram\`
- State diagrams: \`stateDiagram-v2\`
- Entity Relationship: \`erDiagram\`
- User Journey: \`journey\`
- Gantt charts: \`gantt\`
- Pie charts: \`pie\`
- Mindmaps: \`mindmap\`
- And more...

#### EXAMPLES

\`\`\`typescript
// Simple flowchart
const mermaidCode = \`graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E\`;
await showMermaid({ title: 'Decision Flow', code: mermaidCode });

// Sequence diagram
const seqCode = \`sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: I am good thanks!\`;
await showMermaid({ title: 'User Interaction', code: seqCode, description: 'Sequence diagram of user conversation' });

// Class diagram
const classCode = \`classDiagram
    class Animal {
        +String name
        +eat()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog\`;
await showMermaid({ title: 'Class Hierarchy', code: classCode });

// Diagram with auto-save
await showMermaid({ title: 'Decision Flow', code: mermaidCode, saveTo: 'decision-flow.png' });
return { diagram: 'displayed' };
\`\`\``;
};

/**
 * Create a showMermaid function that broadcasts a tool call to the frontend
 */
export function createShowMermaidFunction(broadcast: (type: "tool_call" | "tool_result", data: any) => void) {
  return async (args: { title: string; code: string; description?: string; saveTo?: string }) => {
    const toolCallId = `call_${Date.now()}_mermaid`;

    // Return data for history persistence (no broadcast - will be included in script result)
    return {
      __visualization: {
        type: "show-mermaid",
        toolCallId,
        args
      }
    };
  };
}
