/**
 * Web search options
 */
export interface WebSearchOptions {
  /** Search query to execute */
  search_query: string;
  /** Number of results to return (1-50, default: 10) */
  count?: number;
  /** Location filter: 'cn' for Chinese region, 'us' for non-Chinese region */
  location?: "cn" | "us";
  /** Content size control: 'medium' (400-600 words) or 'high' (2500 words) */
  content_size?: "medium" | "high";
  /** Time range filter */
  search_recency_filter?: "oneDay" | "oneWeek" | "oneMonth" | "oneYear" | "noLimit";
  /** Domain filter to limit search results to specific domains */
  search_domain_filter?: string;
}

/**
 * Web search result item
 */
export interface WebSearchResultItem {
  /** Web page title */
  title: string;
  /** Web page URL */
  url: string;
  /** Web page summary */
  summary: string;
  /** Website name */
  website_name?: string;
  /** Website icon URL */
  website_icon?: string;
}

/**
 * Web search result
 */
export interface WebSearchResult {
  /** Array of search results */
  results: WebSearchResultItem[];
  /** Total number of results found */
  total?: number;
}

/**
 * Exa API response types
 */
interface ExaSearchResult {
  title: string;
  url: string;
  text?: string;
  snippet?: string;
  author?: string;
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
}

/**
 * Create a web search function that searches the web using Exa API
 *
 * Supports:
 * - Configurable result count
 * - Time range filtering
 * - Domain filtering
 * - Content retrieval
 */
export function createWebSearchFunction() {
  return async (options: WebSearchOptions): Promise<WebSearchResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "webSearch requires an options object. Usage: webSearch({ search_query: 'your query' })"
      );
    }

    if (!options.search_query) {
      throw new Error(
        "webSearch requires 'search_query' parameter. Usage: webSearch({ search_query: 'your query' })"
      );
    }

    try {
      const requestBody: any = {
        query: options.search_query,
        numResults: options.count ?? 10,
        contents: {
          text: {
            maxCharacters: options.content_size === "high" ? 2500 : 600,
          },
        },
      };

      // Add time filtering if specified
      if (options.search_recency_filter && options.search_recency_filter !== "noLimit") {
        const now = new Date();
        let startDate: Date;

        switch (options.search_recency_filter) {
          case "oneDay":
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case "oneWeek":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "oneMonth":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "oneYear":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0);
        }

        requestBody.startPublishedDate = startDate.toISOString();
      }

      // Add domain filtering if specified
      if (options.search_domain_filter) {
        requestBody.includeDomains = [options.search_domain_filter];
      }

      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "a5934378-5af8-4227-b979-7415e7129ae5",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Web search failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as ExaSearchResponse;

      // Transform Exa results to match our interface
      const transformedResults = (data.results || []).map((item) => ({
        title: item.title || "",
        url: item.url || "",
        summary: item.text || item.snippet || "",
        website_name: item.author || undefined,
        website_icon: undefined,
      }));

      return {
        results: transformedResults,
        total: data.results?.length || 0,
      };
    } catch (error: any) {
      throw new Error(`Web search failed: ${error.message}`);
    }
  };
}

/**
 * Helper function to perform a quick web search
 */
export async function webSearch(
  query: string,
  options?: Omit<WebSearchOptions, "search_query">
): Promise<WebSearchResult> {
  return createWebSearchFunction()({
    search_query: query,
    ...options,
  });
}
