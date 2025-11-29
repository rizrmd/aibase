import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Memory Tool - Project-level persistent key-value storage
 * Actions: list, read, update, add, remove, categories, keys
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
  description = "Manage project-level memory: store and retrieve knowledge that persists across all conversations. Two-level structure: category -> key -> value. Actions: list (all data), read (category or specific key), update (modify value), add (new key-value), remove (key or category), categories (list all), keys (list keys in category).";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "read", "update", "add", "remove", "categories", "keys"],
        description: "The action to perform",
      },
      category: {
        type: "string",
        description: "Category name (required for read, update, add, remove, keys actions)",
      },
      key: {
        type: "string",
        description: "Key name (required for read with category, update, add, remove actions)",
      },
      value: {
        description: "Value to store (required for update, add actions). Can be any JSON-serializable value.",
      },
    },
    required: ["action"],
  };

  private projectId: string = "default";

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
    action: "list" | "read" | "update" | "add" | "remove" | "categories" | "keys";
    category?: string;
    key?: string;
    value?: any;
  }): Promise<string> {
    try {
      const memory = await this.loadMemory();

      switch (args.action) {
        case "list":
          // Return all memory
          return JSON.stringify(memory, null, 2);

        case "categories":
          // Return list of all categories
          return JSON.stringify({
            categories: Object.keys(memory),
            count: Object.keys(memory).length,
          }, null, 2);

        case "keys":
          // Return list of keys in a category
          if (!args.category) {
            throw new Error("category is required for keys action");
          }
          const categoryData = memory[args.category];
          if (!categoryData) {
            throw new Error(`Category '${args.category}' not found`);
          }
          return JSON.stringify({
            category: args.category,
            keys: Object.keys(categoryData),
            count: Object.keys(categoryData).length,
          }, null, 2);

        case "read":
          // Read entire category or specific key
          if (!args.category) {
            throw new Error("category is required for read action");
          }
          const readCategoryData = memory[args.category];
          if (!readCategoryData) {
            throw new Error(`Category '${args.category}' not found`);
          }
          if (args.key) {
            // Read specific key
            if (!(args.key in readCategoryData)) {
              throw new Error(`Key '${args.key}' not found in category '${args.category}'`);
            }
            return JSON.stringify({
              category: args.category,
              key: args.key,
              value: readCategoryData[args.key],
            }, null, 2);
          } else {
            // Read entire category
            return JSON.stringify({
              category: args.category,
              data: readCategoryData,
            }, null, 2);
          }

        case "add":
          // Add new key-value to category
          if (!args.category) {
            throw new Error("category is required for add action");
          }
          if (!args.key) {
            throw new Error("key is required for add action");
          }
          if (args.value === undefined) {
            throw new Error("value is required for add action");
          }

          // Create category if it doesn't exist
          if (!memory[args.category]) {
            memory[args.category] = {};
          }

          // Get category data (TypeScript now knows it's defined)
          const addCategoryData = memory[args.category]!;

          // Check if key already exists
          if (args.key in addCategoryData) {
            throw new Error(`Key '${args.key}' already exists in category '${args.category}'. Use 'update' to modify existing values.`);
          }

          addCategoryData[args.key] = args.value;
          await this.saveMemory(memory);

          return JSON.stringify({
            action: "added",
            category: args.category,
            key: args.key,
            value: args.value,
          }, null, 2);

        case "update":
          // Update existing key-value
          if (!args.category) {
            throw new Error("category is required for update action");
          }
          if (!args.key) {
            throw new Error("key is required for update action");
          }
          if (args.value === undefined) {
            throw new Error("value is required for update action");
          }
          const updateCategoryData = memory[args.category];
          if (!updateCategoryData) {
            throw new Error(`Category '${args.category}' not found`);
          }
          if (!(args.key in updateCategoryData)) {
            throw new Error(`Key '${args.key}' not found in category '${args.category}'. Use 'add' to create new entries.`);
          }

          const oldValue = updateCategoryData[args.key];
          updateCategoryData[args.key] = args.value;
          await this.saveMemory(memory);

          return JSON.stringify({
            action: "updated",
            category: args.category,
            key: args.key,
            oldValue,
            newValue: args.value,
          }, null, 2);

        case "remove":
          // Remove key from category or entire category
          if (!args.category) {
            throw new Error("category is required for remove action");
          }
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
