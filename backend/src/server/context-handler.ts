import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

/**
 * Get the context template directory path
 */
function getContextDir(): string {
  return join(process.cwd(), "..", "docs");
}

/**
 * Get the context template file path
 */
function getContextFilePath(): string {
  return join(getContextDir(), "context.md");
}

/**
 * Default context template content
 */
const DEFAULT_TEMPLATE = `# AI Assistant Context

use todo tool to track step/phases/stages/parts etc. add/remove/check/uncheck multiple time at once instead of one-by-one.

## SCRIPT TOOL - Execute code with fetch, tools, and context!

Use for: API calls, batch operations, complex workflows, data transformations.

**CRITICAL: Code executes as async function BODY. Write like this:**
- ✓ CORRECT: \`return { result: data }\`
- ✓ CORRECT: \`const x = await fetch(url); return x.json()\`
- ✗ WRONG: \`export const x = ...\` (NO export/import!)

**Available:** fetch, duckdb({ query, database?, format?, readonly? }), postgresql({ query, connectionUrl, format?, timeout? }), pdfReader({ filePath?, buffer?, password?, maxPages?, debug? }), webSearch({ search_query, count?, location?, content_size?, search_recency_filter?, search_domain_filter? }), progress(msg), file(...), todo(...), memory(...), convId, projectId, console

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
async function loadContext(): Promise<string> {
  try {
    const contextPath = getContextFilePath();
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
async function saveContext(content: string): Promise<void> {
  const contextDir = getContextDir();
  const contextPath = getContextFilePath();

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
    const content = await loadContext();

    return Response.json({
      success: true,
      data: {
        content,
        path: getContextFilePath(),
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
 * Handle PUT /api/context - Update context template
 */
export async function handleUpdateContext(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { content } = body;

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
    await saveContext(content);

    return Response.json({
      success: true,
      message: "Context template updated successfully",
      path: getContextFilePath(),
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
