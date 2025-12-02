import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Context for the Confluence tool
 */
export const context = async () => {
  return ``;
};

/**
 * Confluence Tool - Interact with Confluence Cloud using REST API v2
 *
 * Retrieves authentication credentials from memory:
 * - atlassian.api-token: API token from Atlassian
 * - atlassian.email: Email for authentication
 * - atlassian.domain: Confluence domain (e.g., "yourcompany" for yourcompany.atlassian.net)
 *
 * Supported operations:
 * - get_page: Get a page by ID (requires numeric ID)
 * - list_pages: List all pages (optionally filtered by spaceId)
 * - search_pages: Search for pages by title (requires query parameter)
 * - create_page: Create a new page
 * - update_page: Update an existing page (auto-increments version)
 * - get_space: Get space information
 * - list_spaces: List all spaces
 * - get_page_content: Get page content in a specific format (requires numeric ID)
 */

interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

export class ConfluenceTool extends Tool {
  name = "confluence";

  description = `Interact with Confluence Cloud using REST API v2.
Retrieves credentials from memory (atlassian.api-token, atlassian.email, atlassian.domain).
Operations: get_page, list_pages, search_pages (requires query!), create_page, update_page (auto-increments version), get_space, list_spaces, get_page_content.
IMPORTANT: Use list_pages to get all pages. Use search_pages only when you have a search query. pageId must be numeric ID.`;

  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "get_page",
          "list_pages",
          "search_pages",
          "create_page",
          "update_page",
          "get_space",
          "list_spaces",
          "get_page_content"
        ],
        description: "The action to perform on Confluence",
      },
      pageId: {
        type: "string",
        description: "Page ID (required for get_page, update_page, get_page_content)",
      },
      spaceId: {
        type: "string",
        description: "Space ID or key",
      },
      title: {
        type: "string",
        description: "Page title (required for create_page and update_page)",
      },
      content: {
        type: "string",
        description: "Page content in storage format (HTML-like format)",
      },
      parentId: {
        type: "string",
        description: "Parent page ID (for create_page)",
      },
      query: {
        type: "string",
        description: "Search query (for search_pages)",
      },
      format: {
        type: "string",
        enum: ["storage", "atlas_doc_format", "view"],
        description: "Content format (for get_page_content, default: storage)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (for list operations, default: 25)",
      },
    },
    required: ["action"],
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
   * Load memory from file
   */
  private async loadMemory(): Promise<MemoryStore> {
    const memoryPath = this.getMemoryFilePath();

    try {
      const content = await fs.readFile(memoryPath, "utf-8");
      return JSON.parse(content);
    } catch (error: any) {
      throw new Error("Memory file not found. Please ensure credentials are stored in memory.");
    }
  }

  /**
   * Get credentials from memory
   */
  private async getCredentials(): Promise<{
    apiToken: string;
    email: string;
    domain: string;
  }> {
    const memory = await this.loadMemory();

    const atlassian = memory.atlassian;
    if (!atlassian) {
      throw new Error("Atlassian credentials not found in memory. Please set atlassian.api-token, atlassian.email, and atlassian.domain using the memory tool.");
    }

    const apiToken = atlassian["api-token"];
    const email = atlassian.email;
    const domain = atlassian.domain;

    if (!apiToken) {
      throw new Error("atlassian.api-token not found in memory");
    }
    if (!email) {
      throw new Error("atlassian.email not found in memory");
    }
    if (!domain) {
      throw new Error("atlassian.domain not found in memory");
    }

    return { apiToken, email, domain };
  }

  /**
   * Make authenticated request to Confluence API
   */
  private async makeRequest(
    endpoint: string,
    method: string = "GET",
    body?: any
  ): Promise<any> {
    const { apiToken, email, domain } = await this.getCredentials();

    // Create base64 encoded auth header
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    // Handle domain - if it already includes .atlassian.net, use as-is
    // Otherwise, append .atlassian.net
    const fullDomain = domain.includes('.atlassian.net')
      ? domain
      : `${domain}.atlassian.net`;

    const url = `https://${fullDomain}/wiki/api/v2${endpoint}`;

    const headers: Record<string, string> = {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Confluence API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  async execute(args: {
    action: string;
    pageId?: string;
    spaceId?: string;
    title?: string;
    content?: string;
    parentId?: string;
    query?: string;
    format?: string;
    limit?: number;
  }): Promise<string> {
    try {
      let result: any;

      switch (args.action) {
        case "get_page": {
          if (!args.pageId) {
            throw new Error("pageId is required for get_page action");
          }
          result = await this.makeRequest(`/pages/${args.pageId}`);
          break;
        }

        case "list_pages": {
          // List all pages, optionally filtered by spaceId
          const limit = args.limit || 25;
          let endpoint = `/pages?limit=${limit}`;
          if (args.spaceId) {
            endpoint += `&space-id=${args.spaceId}`;
          }
          result = await this.makeRequest(endpoint);
          break;
        }

        case "search_pages": {
          if (!args.query) {
            throw new Error("query is required for search_pages action");
          }
          const limit = args.limit || 25;
          const endpoint = `/pages?title=${encodeURIComponent(args.query)}&limit=${limit}`;
          result = await this.makeRequest(endpoint);
          break;
        }

        case "create_page": {
          if (!args.spaceId) {
            throw new Error("spaceId is required for create_page action");
          }
          if (!args.title) {
            throw new Error("title is required for create_page action");
          }

          const body: any = {
            spaceId: args.spaceId,
            status: "current",
            title: args.title,
            body: {
              representation: "storage",
              value: args.content || "<p>Empty page</p>",
            },
          };

          if (args.parentId) {
            body.parentId = args.parentId;
          }

          result = await this.makeRequest("/pages", "POST", body);
          break;
        }

        case "update_page": {
          if (!args.pageId) {
            throw new Error("pageId is required for update_page action");
          }
          if (!args.title) {
            throw new Error("title is required for update_page action");
          }

          // First, fetch the current page to get the current version
          const currentPage = await this.makeRequest(`/pages/${args.pageId}`);
          const currentVersion = currentPage.version?.number || 1;

          const body: any = {
            id: args.pageId,
            status: "current",
            title: args.title,
            body: {
              representation: "storage",
              value: args.content || "<p>Empty page</p>",
            },
            version: {
              number: currentVersion + 1, // Increment the version
              message: "Updated via API",
            },
          };

          result = await this.makeRequest(`/pages/${args.pageId}`, "PUT", body);
          break;
        }

        case "get_space": {
          if (!args.spaceId) {
            throw new Error("spaceId is required for get_space action");
          }
          result = await this.makeRequest(`/spaces/${args.spaceId}`);
          break;
        }

        case "list_spaces": {
          const limit = args.limit || 25;
          result = await this.makeRequest(`/spaces?limit=${limit}`);
          break;
        }

        case "get_page_content": {
          if (!args.pageId) {
            throw new Error("pageId is required for get_page_content action");
          }
          const format = args.format || "storage";
          result = await this.makeRequest(
            `/pages/${args.pageId}?body-format=${format}`
          );
          break;
        }

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      throw new Error(`Confluence operation failed: ${error.message}`);
    }
  }
}
