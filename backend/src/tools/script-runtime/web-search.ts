/**
 * Context documentation for web search functionality
 */
export const context = async () => {
  return `### WEB SEARCH

Use webSearch() to search the web for information, or imageSearch() to search for images.

**Available:**
- webSearch({ search_query, count?, country?, search_lang?, safesearch?, freshness? })
- imageSearch({ search_query, count?, country?, safesearch?, spellcheck? })

#### WEB SEARCH PARAMETERS

- search_query: Query to search for (required)
- count: Number of results (1-20, default: 10)
- country: Two-letter country code (e.g., 'US', 'GB', 'JP')
- search_lang: Language code (e.g., 'en', 'es', 'fr')
- safesearch: 'off', 'moderate', or 'strict' (default: 'moderate')
- freshness: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year)

#### IMAGE SEARCH PARAMETERS

- search_query: Query to search for images (required)
- count: Number of results (1-150, default: 20)
- country: Two-letter country code
- safesearch: 'off', 'moderate', or 'strict' (default: 'moderate')
- spellcheck: Whether to spellcheck query (default: true)

#### EXAMPLES

\`\`\`typescript
// Web search with freshness filter
progress('Searching web...');
const results = await webSearch({ search_query: 'latest AI developments 2024', count: 5, freshness: 'pm' });
return { total: results.total, results: results.results.map(r => ({ title: r.title, url: r.url, description: r.description })) };

// Image search
progress('Searching for images...');
const images = await imageSearch({ search_query: 'cute cats', count: 10 });
return { total: images.total, images: images.results.map(img => ({ title: img.title, url: img.url, thumbnail: img.thumbnail })) };
\`\`\``;
};

/**
 * Web search options for Brave Search API
 */
export interface WebSearchOptions {
  /** Search query to execute */
  search_query: string;
  /** Number of results to return (1-20, default: 10) */
  count?: number;
  /** Two-letter country code for search region */
  country?: string;
  /** Language code for search results */
  search_lang?: string;
  /** Safe search level: 'off', 'moderate', or 'strict' */
  safesearch?: "off" | "moderate" | "strict";
  /** Time-based freshness filter */
  freshness?: "pd" | "pw" | "pm" | "py";
}

/**
 * Image search options for Brave Search API
 */
export interface ImageSearchOptions {
  /** Search query to execute */
  search_query: string;
  /** Number of results to return (1-150, default: 20) */
  count?: number;
  /** Two-letter country code for search region */
  country?: string;
  /** Safe search level: 'off', 'moderate', or 'strict' */
  safesearch?: "off" | "moderate" | "strict";
  /** Whether to spellcheck the query */
  spellcheck?: boolean;
}

/**
 * Web search result item
 */
export interface WebSearchResultItem {
  /** Web page title */
  title: string;
  /** Web page URL */
  url: string;
  /** Web page description/snippet */
  description: string;
  /** Page age (e.g., "2 days ago") */
  age?: string;
  /** Language of the page */
  language?: string;
  /** Favicon URL */
  favicon?: string;
}

/**
 * Image search result item
 */
export interface ImageSearchResultItem {
  /** Image title/description */
  title: string;
  /** Direct image URL */
  url: string;
  /** Thumbnail image URL */
  thumbnail: string;
  /** Source page URL */
  source: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
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
 * Image search result
 */
export interface ImageSearchResult {
  /** Array of image search results */
  results: ImageSearchResultItem[];
  /** Total number of results found */
  total?: number;
}

/**
 * Brave API web search response types
 */
interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  language?: string;
  page_age?: string;
  profile?: {
    name?: string;
    url?: string;
    img?: string;
  };
  meta_url?: {
    scheme?: string;
    netloc?: string;
    hostname?: string;
    favicon?: string;
  };
}

interface BraveWebSearchResponse {
  web?: {
    results: BraveWebResult[];
  };
  query?: {
    original?: string;
  };
}

/**
 * Brave API image search response types
 */
interface BraveImageResult {
  title: string;
  url: string;
  source: string;
  page_fetched?: string;
  thumbnail?: {
    src: string;
  };
  properties?: {
    url?: string;
    width?: number;
    height?: number;
  };
}

interface BraveImageSearchResponse {
  results: BraveImageResult[];
  query?: {
    original?: string;
  };
}

/**
 * Get API key from environment
 */
function getBraveApiKey(): string {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BRAVE_API_KEY environment variable is not set. Get your API key from https://brave.com/search/api/"
    );
  }
  return apiKey;
}

/**
 * Create a web search function that searches the web using Brave Search API
 *
 * Supports:
 * - Configurable result count
 * - Time range filtering (freshness)
 * - Country/region filtering
 * - Language filtering
 * - Safe search levels
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
      const params = new URLSearchParams({
        q: options.search_query,
        count: String(options.count ?? 10),
      });

      if (options.country) {
        params.append("country", options.country);
      }

      if (options.search_lang) {
        params.append("search_lang", options.search_lang);
      }

      if (options.safesearch) {
        params.append("safesearch", options.safesearch);
      } else {
        params.append("safesearch", "strict");
      }

      if (options.freshness) {
        params.append("freshness", options.freshness);
      }

      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": getBraveApiKey(),
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Brave web search failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as BraveWebSearchResponse;

      // Transform Brave results to match our interface
      const webResults = data.web?.results || [];
      const transformedResults = webResults.map((item) => ({
        title: item.title || "",
        url: item.url || "",
        description: item.description || "",
        age: item.age || item.page_age,
        language: item.language,
        favicon: item.meta_url?.favicon,
      }));

      return {
        results: transformedResults,
        total: transformedResults.length,
      };
    } catch (error: any) {
      throw new Error(`Web search failed: ${error.message}`);
    }
  };
}

/**
 * Create an image search function that searches for images using Brave Search API
 *
 * Supports:
 * - Configurable result count (up to 150 images)
 * - Country/region filtering
 * - Safe search levels
 * - Spellcheck
 */
export function createImageSearchFunction() {
  return async (options: ImageSearchOptions): Promise<ImageSearchResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "imageSearch requires an options object. Usage: imageSearch({ search_query: 'your query' })"
      );
    }

    if (!options.search_query) {
      throw new Error(
        "imageSearch requires 'search_query' parameter. Usage: imageSearch({ search_query: 'your query' })"
      );
    }

    try {
      const params = new URLSearchParams({
        q: options.search_query,
        count: String(options.count ?? 20),
      });

      if (options.country) {
        params.append("country", options.country);
      }

      if (options.safesearch) {
        params.append("safesearch", options.safesearch);
      }

      if (options.spellcheck !== undefined) {
        params.append("spellcheck", String(options.spellcheck));
      }

      const response = await fetch(
        `https://api.search.brave.com/res/v1/images/search?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": getBraveApiKey(),
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Brave image search failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as BraveImageSearchResponse;

      // Transform Brave results to match our interface
      const imageResults = data.results || [];
      const transformedResults = imageResults.map((item) => ({
        title: item.title || "",
        url: item.properties?.url || item.url || "",
        thumbnail: item.thumbnail?.src || "",
        source: item.source || "",
        width: item.properties?.width,
        height: item.properties?.height,
      }));

      return {
        results: transformedResults,
        total: transformedResults.length,
      };
    } catch (error: any) {
      throw new Error(`Image search failed: ${error.message}`);
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

/**
 * Helper function to perform a quick image search
 */
export async function imageSearch(
  query: string,
  options?: Omit<ImageSearchOptions, "search_query">
): Promise<ImageSearchResult> {
  return createImageSearchFunction()({
    search_query: query,
    ...options,
  });
}
