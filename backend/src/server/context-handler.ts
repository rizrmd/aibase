import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

/**
 * Load tool examples from tool definition files
 */
async function loadToolExamples(): Promise<string> {
  try {
    // Import examples from tool definition files
    const { SCRIPT_TOOL_EXAMPLES } = await import("../tools/definition/script-tool");
    const { FILE_TOOL_EXAMPLES } = await import("../tools/definition/file-tool");
    const { TODO_TOOL_EXAMPLES } = await import("../tools/definition/todo-tool");
    const { MEMORY_TOOL_EXAMPLES } = await import("../tools/definition/memory-tool");

    // Combine all tool examples in logical order
    const examples: string[] = [];

    if (SCRIPT_TOOL_EXAMPLES) examples.push(SCRIPT_TOOL_EXAMPLES);
    if (FILE_TOOL_EXAMPLES) examples.push(FILE_TOOL_EXAMPLES);
    if (TODO_TOOL_EXAMPLES) examples.push(TODO_TOOL_EXAMPLES);
    if (MEMORY_TOOL_EXAMPLES) examples.push(MEMORY_TOOL_EXAMPLES);

    return examples.join("\n\n");
  } catch (error) {
    console.error("Failed to load tool examples:", error);
    return "";
  }
}

/**
 * Expand template placeholders (for UI display)
 */
async function expandTemplate(template: string): Promise<string> {
  let expanded = template;

  // Replace tool examples placeholder
  const toolExamples = await loadToolExamples();
  expanded = expanded.replace("{{TOOL_EXAMPLES}}", toolExamples);

  // Remove other placeholders for UI (they're only used at runtime)
  expanded = expanded.replace("{{MEMORY}}", "");
  expanded = expanded.replace("{{TODOS}}", "");

  return expanded;
}

/**
 * Get the context template directory path for a project
 */
function getContextDir(projectId: string): string {
  return join(process.cwd(), "data", projectId);
}

/**
 * Get the context template file path for a project
 */
function getContextFilePath(projectId: string): string {
  return join(getContextDir(projectId), "context.md");
}

/**
 * Default context template content
 */
const DEFAULT_TEMPLATE = `# AI Assistant Context

use todo tool to track step/phases/stages/parts etc. add/remove/check/uncheck multiple time at once instead of one-by-one.

{{TOOL_EXAMPLES}}

## MEMORY TOOL - TWO-LEVEL STRUCTURE:

Memory has TWO levels: [category] -> key: value
- First level: CATEGORY (e.g., "database", "settings", "api_keys")
- Second level: KEY: VALUE pairs within that category

### To use memory tool:
- **SET:** \`memory({ action: "set", category: "database", key: "postgresql_url", value: "postgresql://..." })\`
- **REMOVE KEY:** \`memory({ action: "remove", category: "database", key: "postgresql_url" })\`
- **REMOVE CATEGORY:** \`memory({ action: "remove", category: "database" })\`
- **READ:** Just look at your context! Memory is ALWAYS appended below - you never need to read it.

Write as async function body - NO import/export, just await and return!

{{MEMORY}}

{{TODOS}}
`;

/**
 * Load context template from file
 */
async function loadContext(projectId: string): Promise<string> {
  try {
    const contextPath = getContextFilePath(projectId);
    const content = await readFile(contextPath, "utf-8");
    return content;
  } catch (error) {
    // Return default template if file doesn't exist
    return DEFAULT_TEMPLATE;
  }
}

/**
 * Save context template to file
 */
async function saveContext(projectId: string, content: string): Promise<void> {
  const contextDir = getContextDir(projectId);
  const contextPath = getContextFilePath(projectId);

  // Ensure directory exists
  await mkdir(contextDir, { recursive: true });

  // Write context file
  await writeFile(contextPath, content, "utf-8");
}

/**
 * Handle GET /api/context - Get context template
 */
export async function handleGetContext(req: Request): Promise<Response> {
  try {
    // Get projectId from query params (default to "A1" for backward compatibility)
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || "A1";

    const content = await loadContext(projectId);

    return Response.json({
      success: true,
      data: {
        content,
        path: getContextFilePath(projectId),
        projectId,
      },
    });
  } catch (error) {
    console.error("Error getting context:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get context",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET /api/context/default - Get default context template
 */
export async function handleGetDefaultContext(req: Request): Promise<Response> {
  try {
    // Expand template placeholders so users see actual content, not {{PLACEHOLDERS}}
    const expandedTemplate = await expandTemplate(DEFAULT_TEMPLATE);

    return Response.json({
      success: true,
      data: {
        content: expandedTemplate,
        isDefault: true,
      },
    });
  } catch (error) {
    console.error("Error getting default context:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get default context",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle PUT /api/context - Update context template
 */
export async function handleUpdateContext(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { content, projectId = "A1" } = body;

    if (typeof content !== "string") {
      return Response.json(
        {
          success: false,
          error: "Content must be a string",
        },
        { status: 400 }
      );
    }

    // Save the new content
    await saveContext(projectId, content);

    return Response.json({
      success: true,
      message: "Context template updated successfully",
      path: getContextFilePath(projectId),
      projectId,
    });
  } catch (error) {
    console.error("Error updating context:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update context",
      },
      { status: 500 }
    );
  }
}
