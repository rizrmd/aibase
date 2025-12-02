import { Tool } from "../../llm/conversation";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Context for the Jira tool
 */
export const context = async () => {
  return ``;
};

/**
 * Jira Tool - Interact with Jira Cloud using REST API v3
 *
 * Retrieves authentication credentials from memory:
 * - atlassian.api-token: API token from Atlassian
 * - atlassian.email: Email for authentication
 * - atlassian.domain: Jira domain (e.g., "yourcompany" for yourcompany.atlassian.net)
 *
 * Supported operations:
 * - get_issue: Get an issue by key (e.g., "PROJ-123")
 * - search_issues: Search issues using JQL (Jira Query Language)
 * - create_issue: Create a new issue
 * - update_issue: Update an existing issue
 * - add_comment: Add a comment to an issue
 * - get_transitions: Get available transitions for an issue
 * - transition_issue: Transition an issue to a new status
 * - list_projects: List all projects
 * - get_project: Get project details
 * - assign_issue: Assign issue to a user
 */

interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

export class JiraTool extends Tool {
  name = "jira";

  description = `Interact with Jira Cloud using REST API v3.
Retrieves credentials from memory (atlassian.api-token, atlassian.email, atlassian.domain).
Operations: get_issue, search_issues (JQL), create_issue, update_issue, add_comment, get_transitions, transition_issue, list_projects, get_project, assign_issue.
IMPORTANT: Use issue KEY (e.g., "PROJ-123") not ID. JQL examples: "project = PROJ", "assignee = currentUser()", "status = 'In Progress'"`;

  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "get_issue",
          "search_issues",
          "create_issue",
          "update_issue",
          "add_comment",
          "get_transitions",
          "transition_issue",
          "list_projects",
          "get_project",
          "assign_issue"
        ],
        description: "The action to perform on Jira",
      },
      issueKey: {
        type: "string",
        description: "Issue key (e.g., 'PROJ-123') - required for get_issue, update_issue, add_comment, get_transitions, transition_issue, assign_issue",
      },
      jql: {
        type: "string",
        description: "JQL query string (required for search_issues). Examples: 'project = PROJ', 'assignee = currentUser() AND status != Done'",
      },
      projectKey: {
        type: "string",
        description: "Project key (required for create_issue and get_project)",
      },
      summary: {
        type: "string",
        description: "Issue summary/title (required for create_issue)",
      },
      description: {
        type: "string",
        description: "Issue description (for create_issue and update_issue)",
      },
      issueType: {
        type: "string",
        description: "Issue type name (e.g., 'Task', 'Bug', 'Story') - required for create_issue",
      },
      priority: {
        type: "string",
        description: "Priority name (e.g., 'High', 'Medium', 'Low')",
      },
      assignee: {
        type: "string",
        description: "Assignee account ID or email",
      },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Array of labels",
      },
      comment: {
        type: "string",
        description: "Comment text (required for add_comment)",
      },
      transitionId: {
        type: "string",
        description: "Transition ID (required for transition_issue, get from get_transitions)",
      },
      fields: {
        type: "object",
        description: "Custom fields object for update_issue",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results (for search_issues and list_projects, default: 50)",
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
   * Make authenticated request to Jira API
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

    const url = `https://${fullDomain}/rest/api/3${endpoint}`;

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
      throw new Error(`Jira API error (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  async execute(args: {
    action: string;
    issueKey?: string;
    jql?: string;
    projectKey?: string;
    summary?: string;
    description?: string;
    issueType?: string;
    priority?: string;
    assignee?: string;
    labels?: string[];
    comment?: string;
    transitionId?: string;
    fields?: any;
    maxResults?: number;
  }): Promise<string> {
    try {
      let result: any;

      switch (args.action) {
        case "get_issue": {
          if (!args.issueKey) {
            throw new Error("issueKey is required for get_issue action");
          }
          result = await this.makeRequest(`/issue/${args.issueKey}`);
          break;
        }

        case "search_issues": {
          if (!args.jql) {
            throw new Error("jql is required for search_issues action");
          }
          const maxResults = args.maxResults || 50;
          // Use the new /search/jql endpoint (the old /search is deprecated as of API v3)
          const body = {
            jql: args.jql,
            maxResults: maxResults,
            fields: ["*all"], // Include all fields
          };
          result = await this.makeRequest("/search/jql", "POST", body);
          break;
        }

        case "create_issue": {
          if (!args.projectKey) {
            throw new Error("projectKey is required for create_issue action");
          }
          if (!args.summary) {
            throw new Error("summary is required for create_issue action");
          }
          if (!args.issueType) {
            throw new Error("issueType is required for create_issue action");
          }

          const body: any = {
            fields: {
              project: {
                key: args.projectKey,
              },
              summary: args.summary,
              issuetype: {
                name: args.issueType,
              },
            },
          };

          if (args.description) {
            body.fields.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: args.description,
                    },
                  ],
                },
              ],
            };
          }

          if (args.priority) {
            body.fields.priority = { name: args.priority };
          }

          if (args.assignee) {
            body.fields.assignee = { id: args.assignee };
          }

          if (args.labels && args.labels.length > 0) {
            body.fields.labels = args.labels;
          }

          result = await this.makeRequest("/issue", "POST", body);
          break;
        }

        case "update_issue": {
          if (!args.issueKey) {
            throw new Error("issueKey is required for update_issue action");
          }

          const body: any = {
            fields: args.fields || {},
          };

          if (args.summary) {
            body.fields.summary = args.summary;
          }

          if (args.description) {
            body.fields.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: args.description,
                    },
                  ],
                },
              ],
            };
          }

          if (args.priority) {
            body.fields.priority = { name: args.priority };
          }

          if (args.labels) {
            body.fields.labels = args.labels;
          }

          result = await this.makeRequest(`/issue/${args.issueKey}`, "PUT", body);
          // PUT returns empty response on success
          result = { success: true, message: `Issue ${args.issueKey} updated successfully` };
          break;
        }

        case "add_comment": {
          if (!args.issueKey) {
            throw new Error("issueKey is required for add_comment action");
          }
          if (!args.comment) {
            throw new Error("comment is required for add_comment action");
          }

          const body = {
            body: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: args.comment,
                    },
                  ],
                },
              ],
            },
          };

          result = await this.makeRequest(`/issue/${args.issueKey}/comment`, "POST", body);
          break;
        }

        case "get_transitions": {
          if (!args.issueKey) {
            throw new Error("issueKey is required for get_transitions action");
          }
          result = await this.makeRequest(`/issue/${args.issueKey}/transitions`);
          break;
        }

        case "transition_issue": {
          if (!args.issueKey) {
            throw new Error("issueKey is required for transition_issue action");
          }
          if (!args.transitionId) {
            throw new Error("transitionId is required for transition_issue action");
          }

          const body = {
            transition: {
              id: args.transitionId,
            },
          };

          result = await this.makeRequest(`/issue/${args.issueKey}/transitions`, "POST", body);
          // POST returns empty response on success
          result = { success: true, message: `Issue ${args.issueKey} transitioned successfully` };
          break;
        }

        case "list_projects": {
          const maxResults = args.maxResults || 50;
          result = await this.makeRequest(`/project/search?maxResults=${maxResults}`);
          break;
        }

        case "get_project": {
          if (!args.projectKey) {
            throw new Error("projectKey is required for get_project action");
          }
          result = await this.makeRequest(`/project/${args.projectKey}`);
          break;
        }

        case "assign_issue": {
          if (!args.issueKey) {
            throw new Error("issueKey is required for assign_issue action");
          }
          if (!args.assignee) {
            throw new Error("assignee is required for assign_issue action");
          }

          const body = {
            accountId: args.assignee,
          };

          result = await this.makeRequest(`/issue/${args.issueKey}/assignee`, "PUT", body);
          // PUT returns empty response on success
          result = { success: true, message: `Issue ${args.issueKey} assigned successfully` };
          break;
        }

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      throw new Error(`Jira operation failed: ${error.message}`);
    }
  }
}
