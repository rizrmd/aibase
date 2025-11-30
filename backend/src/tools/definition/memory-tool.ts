import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Memory Tool - Project-level persistent key-value storage
 * Memory is always visible in the context - no need to read it!
 * Actions: set, remove
 * Memory is stored per project in /data/{proj-id}/memory.json
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

  /**
   * Set the project ID for this tool instance
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * Get the path to the memory file
   */
  private getMemoryFilePath(): string {
    return path.join(
      process.cwd(),
      "data",
      this.projectId,
      "memory.json"
    );
  }

  /**
   * Get the directory containing the memory file
   */
  private getMemoryDir(): string {
    return path.join(process.cwd(), "data", this.projectId);
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
