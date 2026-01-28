import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "../utils/logger";
import { getProjectDir } from "../config/paths";
import { ProjectStorage } from "../storage/project-storage";

const logger = createLogger("Memory");

export interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

/**
 * Get the memory directory path for a project
 * Returns: data/projects/{tenantId}/{projectId}/
 */
async function getMemoryDir(projectId: string): Promise<string> {
  // Get tenant_id for the project
  const projectStorage = ProjectStorage.getInstance();
  const project = projectStorage.getById(projectId);
  const tenantId = project?.tenant_id ?? 'default';

  return getProjectDir(projectId, tenantId);
}

/**
 * Get the memory file path for a project
 * Returns: data/projects/{tenantId}/{projectId}/memory.json
 */
async function getMemoryFilePath(projectId: string): Promise<string> {
  const memoryDir = await getMemoryDir(projectId);
  return join(memoryDir, "memory.json");
}

/**
 * Load memory from file
 */
async function loadMemory(projectId: string): Promise<MemoryStore> {
  try {
    const memoryPath = await getMemoryFilePath(projectId);
    const content = await readFile(memoryPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    // Return empty memory if file doesn't exist
    return {};
  }
}

/**
 * Save memory to file
 */
async function saveMemory(projectId: string, memory: MemoryStore): Promise<void> {
  const memoryDir = await getMemoryDir(projectId);
  const memoryPath = await getMemoryFilePath(projectId);

  // Ensure directory exists
  await mkdir(memoryDir, { recursive: true });

  // Write memory file
  await writeFile(memoryPath, JSON.stringify(memory, null, 2), "utf-8");
}

/**
 * Handle GET /api/memory - Get all memory or specific category
 */
export async function handleGetMemory(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || "A1";
    const category = url.searchParams.get("category");

    const memory = await loadMemory(projectId);

    if (category) {
      // Return specific category
      return Response.json({
        success: true,
        data: memory[category] || {},
      });
    }

    // Return all memory
    return Response.json({
      success: true,
      data: memory,
    });
  } catch (error) {
    logger.error({ error }, "Error getting memory");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get memory",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle POST /api/memory - Set a key-value pair
 */
export async function handleSetMemory(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || "A1";

    const body = await req.json() as { category?: unknown; key?: unknown; value?: unknown };
    const { category, key, value } = body;

    if (!category || !key) {
      return Response.json(
        {
          success: false,
          error: "Category and key are required",
        },
        { status: 400 }
      );
    }

    const memory = await loadMemory(projectId);

    // Ensure category exists
    const cat = category as string;
    if (!memory[cat]) {
      memory[cat] = {};
    }

    const oldValue = memory[cat]?.[key as string];
    const action = oldValue !== undefined ? "updated" : "created";

    // Set the value
    if (memory[cat]) {
      memory[cat][key as string] = value;
    }

    // Save to file
    await saveMemory(projectId, memory);

    return Response.json({
      success: true,
      action,
      category,
      key,
      value,
      oldValue,
    });
  } catch (error) {
    logger.error({ error }, "Error setting memory");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set memory",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle DELETE /api/memory - Remove a key or entire category
 */
export async function handleDeleteMemory(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || "A1";
    const category = url.searchParams.get("category");
    const key = url.searchParams.get("key");

    if (!category) {
      return Response.json(
        {
          success: false,
          error: "Category is required",
        },
        { status: 400 }
      );
    }

    const memory = await loadMemory(projectId);

    if (!memory[category]) {
      return Response.json(
        {
          success: false,
          error: "Category not found",
        },
        { status: 404 }
      );
    }

    if (key) {
      // Remove specific key
      if (!(key in memory[category])) {
        return Response.json(
          {
            success: false,
            error: "Key not found in category",
          },
          { status: 404 }
        );
      }

      const removedValue = memory[category][key];
      delete memory[category][key];

      // Remove category if empty
      if (Object.keys(memory[category]).length === 0) {
        delete memory[category];
      }

      await saveMemory(projectId, memory);

      return Response.json({
        success: true,
        action: "removed",
        category,
        key,
        removedValue,
      });
    } else {
      // Remove entire category
      const keysRemoved = Object.keys(memory[category]).length;
      const removedData = memory[category];
      delete memory[category];

      await saveMemory(projectId, memory);

      return Response.json({
        success: true,
        action: "removed",
        category,
        keysRemoved,
        removedData,
      });
    }
  } catch (error) {
    logger.error({ error }, "Error deleting memory");
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete memory",
      },
      { status: 500 }
    );
  }
}
