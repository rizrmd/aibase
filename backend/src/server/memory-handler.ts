import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

export interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

/**
 * Get the memory directory path for a project
 */
function getMemoryDir(projectId: string): string {
  return join(process.cwd(), "data", projectId);
}

/**
 * Get the memory file path for a project
 */
function getMemoryFilePath(projectId: string): string {
  return join(getMemoryDir(projectId), "memory.json");
}

/**
 * Load memory from file
 */
async function loadMemory(projectId: string): Promise<MemoryStore> {
  try {
    const memoryPath = getMemoryFilePath(projectId);
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
  const memoryDir = getMemoryDir(projectId);
  const memoryPath = getMemoryFilePath(projectId);

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
    console.error("Error getting memory:", error);
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

    const body = await req.json();
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
    if (!memory[category]) {
      memory[category] = {};
    }

    const oldValue = memory[category][key];
    const action = oldValue !== undefined ? "updated" : "created";

    // Set the value
    memory[category][key] = value;

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
    console.error("Error setting memory:", error);
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
    console.error("Error deleting memory:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete memory",
      },
      { status: 500 }
    );
  }
}
