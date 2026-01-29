import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { createLogger } from "../utils/logger";
import { getProjectDir } from "../config/paths";
import { ProjectStorage } from "../storage/project-storage";

const logger = createLogger("Context");

/**
 * Load tool examples from tool definition files
 */
async function loadToolExamples(): Promise<string> {
  try {
    // Import context functions from tool definition files
    const scriptTool = await import("../tools/definition/script-tool");
    const todoTool = await import("../tools/definition/todo-tool");
    const memoryTool = await import("../tools/definition/memory-tool");

    // Combine all tool examples in logical order
    const examples: string[] = [];

    // Call each context function and collect the results
    if (scriptTool.context) {
      const scriptContext = await scriptTool.context();
      examples.push(scriptContext);
    }

    if (todoTool.context) {
      const todoContext = await todoTool.context();
      examples.push(todoContext);
    }

    if (memoryTool.context) {
      const memoryContext = await memoryTool.context();
      examples.push(memoryContext);
    }

    return examples.join("\n\n");
  } catch (error) {
    logger.error({ error }, "Failed to load tool examples");
    return "";
  }
}

/**
 * Expand template placeholders (for UI display)
 */
async function expandTemplate(template: string): Promise<string> {
  let expanded = template;

  // Replace tool context placeholder
  const toolContext = await loadToolExamples();
  expanded = expanded.replace("{{TOOL_CONTEXT}}", toolContext);

  // Remove other placeholders for UI (they're only used at runtime)
  expanded = expanded.replace("{{MEMORY}}", "");
  expanded = expanded.replace("{{TODOS}}", "");

  return expanded;
}

/**
 * Get the context template directory path for a project
 * Returns: data/projects/{tenantId}/{projectId}/
 */
async function getContextDir(projectId: string): Promise<string> {
  // Get tenant_id for the project
  const projectStorage = ProjectStorage.getInstance();
  const project = projectStorage.getById(projectId);
  const tenantId = project?.tenant_id ?? 'default';

  return getProjectDir(projectId, tenantId);
}

/**
 * Get the context template file path for a project
 * Returns: data/projects/{tenantId}/{projectId}/context.md
 */
async function getContextFilePath(projectId: string): Promise<string> {
  const contextDir = await getContextDir(projectId);
  return join(contextDir, "context.md");
}

/**
 * Default context template content
 */
const DEFAULT_TEMPLATE = `# AI Assistant Context

{{TOOL_CONTEXT}}

`;

/**
 * Load context template from file
 */
async function loadContext(projectId: string): Promise<string> {
  try {
    const contextPath = await getContextFilePath(projectId);
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
  const contextDir = await getContextDir(projectId);
  const contextPath = await getContextFilePath(projectId);

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
    // Get projectId from query params
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return Response.json(
        {
          success: false,
          error: "Project ID is required",
        },
        { status: 400 }
      );
    }

    const content = await loadContext(projectId);
    const contextPath = await getContextFilePath(projectId);

    return Response.json({
      success: true,
      data: {
        content,
        path: contextPath,
        projectId,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting context");
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
    return Response.json({
      success: true,
      data: {
        content: DEFAULT_TEMPLATE,
        isDefault: true,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error getting default context");
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
    const { content, projectId } = body as any;

    if (!projectId) {
      return Response.json(
        {
          success: false,
          error: "Project ID is required",
        },
        { status: 400 }
      );
    }

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
    const contextPath = await getContextFilePath(projectId);

    return Response.json({
      success: true,
      message: "Context template updated successfully",
      path: contextPath,
      projectId,
    });
  } catch (error) {
    logger.error({ error }, "Error updating context");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update context",
      },
      { status: 500 }
    );
  }
}
