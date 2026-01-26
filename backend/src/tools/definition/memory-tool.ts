import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";
import { getProjectDir } from "../../config/paths";
import { ProjectStorage } from "../../storage/project-storage";

/**
 * Context for the Memory tool
 */
export const context = async () => {
  return `## MEMORY TOOL - Project-wide persistent storage

Memory has TWO levels: [category] -> key: value
- First level: CATEGORY (e.g., "database", "settings", "api_keys")
- Second level: KEY: VALUE pairs within that category

**IMPORTANT:** Memory is ALWAYS visible in your context - you never need to read it!

### Examples:
\`\`\`typescript
// Set a value in memory
await memory({ action: 'set', category: 'database', key: 'postgresql_url', value: 'postgresql://user:pass@localhost:5432/mydb' });

// Set multiple values (one at a time)
await memory({ action: 'set', category: 'api_keys', key: 'openai', value: 'sk-...' });
await memory({ action: 'set', category: 'api_keys', key: 'github', value: 'ghp_...' });

// Remove a specific key
await memory({ action: 'remove', category: 'database', key: 'postgresql_url' });

// Remove entire category
await memory({ action: 'remove', category: 'api_keys' });
\`\`\`

### Memory structure example:
\`\`\`
[database] ← category
  postgresql_url: postgresql://user:pass@localhost:5432/mydb ← key: value
  last_connected: 2024-01-15
[api_keys] ← category
  openai: sk-... ← key: value
\`\`\``;
};

/**
 * Memory Tool - Project-level persistent key-value storage
 * Memory is always visible in the context - no need to read it!
 * Actions: set, remove
 * Memory is stored per project in /data/projects/{tenantId}/{projectId}/memory.json
 * Structure: { category: { key: value } }
 */

export interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

export class MemoryTool extends Tool {
  name = "memory";
  description = "Store and update project-level memory that persists across all conversations. Memory is ALWAYS visible in your context - you never need to read it! Structure: category -> key -> value. Actions: set (create or update), remove (delete key or category).";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["set", "remove"],
        description: "The action to perform: 'set' to store/update data, 'remove' to delete",
      },
      category: {
        type: "string",
        description: "Category name (required for both set and remove actions)",
      },
      key: {
        type: "string",
        description: "Key name (required for set action, optional for remove - if omitted, removes entire category)",
      },
      value: {
        description: "Value to store (required for set action). Can be any JSON-serializable value.",
      },
    },
    required: ["action", "category"],
  };

  private projectId: string = "A1";
  private tenantId: number | string = "default";

  /**
   * Set the project ID for this tool instance
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;

    // Also fetch and store tenant_id
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    this.tenantId = project?.tenant_id ?? 'default';
  }

  /**
   * Set the tenant ID for this tool instance
   */
  setTenantId(tenantId: number | string): void {
    this.tenantId = tenantId;
  }

  /**
   * Get the path to the memory file
   * Returns: data/projects/{tenantId}/{projectId}/memory.json
   */
  private getMemoryFilePath(): string {
    return path.join(getProjectDir(this.projectId, this.tenantId), "memory.json");
  }

  /**
   * Get the directory containing the memory file
   * Returns: data/projects/{tenantId}/{projectId}/
   */
  private getMemoryDir(): string {
    return getProjectDir(this.projectId, this.tenantId);
  }

  /**
   * Load memory from file
   */
  private async loadMemory(): Promise<MemoryStore> {
    const memoryPath = this.getMemoryFilePath();
    const memoryDir = this.getMemoryDir();

    // Ensure directory exists
    await fs.mkdir(memoryDir, { recursive: true });

    try {
      const content = await fs.readFile(memoryPath, "utf-8");
      return JSON.parse(content);
    } catch (error: any) {
      // File doesn't exist or is invalid, return empty object
      return {};
    }
  }

  /**
   * Save memory to file
   */
  private async saveMemory(memory: MemoryStore): Promise<void> {
    const memoryPath = this.getMemoryFilePath();
    await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2), "utf-8");
  }

  async execute(args: {
    action: "set" | "remove";
    category: string;
    key?: string;
    value?: any;
  }): Promise<string> {
    try {
      const memory = await this.loadMemory();

      switch (args.action) {
        case "set":
          // Set key-value (create or update)
          if (!args.key) {
            throw new Error("key is required for set action");
          }
          if (args.value === undefined) {
            throw new Error("value is required for set action");
          }

          // Create category if it doesn't exist
          if (!memory[args.category]) {
            memory[args.category] = {};
          }

          // Get category data (TypeScript now knows it's defined)
          const setCategoryData = memory[args.category]!;

          // Check if key already exists to determine if this is create or update
          const isUpdate = args.key in setCategoryData;
          const oldValue = isUpdate ? setCategoryData[args.key] : undefined;

          // Set the value
          setCategoryData[args.key] = args.value;
          await this.saveMemory(memory);

          return JSON.stringify({
            action: isUpdate ? "updated" : "created",
            category: args.category,
            key: args.key,
            ...(isUpdate && { oldValue }),
            value: args.value,
          }, null, 2);

        case "remove":
          // Remove key from category or entire category
          const removeCategoryData = memory[args.category];
          if (!removeCategoryData) {
            throw new Error(`Category '${args.category}' not found`);
          }

          if (args.key) {
            // Remove specific key
            if (!(args.key in removeCategoryData)) {
              throw new Error(`Key '${args.key}' not found in category '${args.category}'`);
            }
            const removedValue = removeCategoryData[args.key];
            delete removeCategoryData[args.key];

            // Remove category if empty
            if (Object.keys(removeCategoryData).length === 0) {
              delete memory[args.category];
            }

            await this.saveMemory(memory);

            return JSON.stringify({
              action: "removed",
              category: args.category,
              key: args.key,
              removedValue,
            }, null, 2);
          } else {
            // Remove entire category
            const removedData = removeCategoryData;
            delete memory[args.category];
            await this.saveMemory(memory);

            return JSON.stringify({
              action: "removed",
              category: args.category,
              removedData,
              keysRemoved: Object.keys(removedData).length,
            }, null, 2);
          }

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error: any) {
      throw new Error(`Memory operation failed: ${error.message}`);
    }
  }
}
