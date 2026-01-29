/**
 * Search Extension
 * Web and image search using Brave Search API
 */

// Type definitions
interface WebSearchOptions {
  search_query: string;
  count?: number;
  country?: string;
  search_lang?: string;
  safesearch?: "off" | "moderate" | "strict";
  freshness?: "pd" | "pw" | "pm" | "py" | "pn";
  text_decorrelation?: boolean;
}

interface ImageSearchOptions {
  search_query: string;
  count?: number;
  country?: string;
  safesearch?: "off" | "moderate" | "strict";
  spellcheck?: boolean;
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  language?: string;
  meta_url?: {
    favicon?: string;
  };
}

interface BraveWebSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

interface BraveImageResult {
  title?: string;
  properties?: {
    url?: string;
    width?: number;
    height?: number;
  };
  url?: string;
  thumbnail?: {
    src?: string;
  };
  source?: string;
}

interface BraveImageSearchResponse {
  results?: BraveImageResult[];
}

interface TransformedWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  language?: string;
  favicon?: string;
}

interface TransformedImageResult {
  title: string;
  url: string;
  thumbnail: string;
  source: string;
  width?: number;
  height?: number;
}

interface WebSearchResult {
  results: TransformedWebResult[];
  total: number;
}

interface ImageSearchResult {
  results: TransformedImageResult[];
  total: number;
}

/**
 * Context documentation for the search extension
 */
function context() {
  return `
### Search Extension

Search the web and find images using Brave Search API.

**Available Functions:**

#### web(options)
Search the web for information.

```typescript
await search.web({
  search_query: "latest AI developments 2024",
  count: 10,                   // Optional: number of results (default: 10)
  country: "US",               // Optional: country code
  search_lang: "en",           // Optional: language code
  safesearch: "moderate",      // Optional: "off", "moderate", "strict"
  freshness: "py",             // Optional: time filter - "pd", "pw", "pm", "py", "pn"
  text_decorrelation: true      // Optional: deduplicate results
});
```

**Parameters:**
- `search_query` (required): Search query string
- `count` (optional): Number of results to return (default: 10)
- `country` (optional): Country code (e.g., "US", "UK", "ID")
- `search_lang` (optional): Language code (e.g., "en", "id", "es")
- `safesearch` (optional): Safe search level - "off", "moderate", "strict"
- `freshness` (optional): Time filter
  - `pd`: past day
  - `pw`: past week
  - `pm`: past month
  - `py`: past year
  - `pn`: no limit
- `text_decorrelation` (optional): Remove similar results (default: false)

**Returns:**
```typescript
{
  results: Array<{
    title: string,
    url: string,
    description: string,
    published?: string
  }>,
  total: number
}
```

#### image(options)
Search for images.

```typescript
await search.image({
  search_query: "cute cats",
  count: 10,                    // Optional: number of results (default: 20)
  country: "US",                // Optional: country code
  safesearch: "moderate",        // Optional: "off", "moderate", "strict"
  spellcheck: true               // Optional: enable spell checking
});
```

**Parameters:**
- `search_query` (required): Search query string
- `count` (optional): Number of results to return (default: 20)
- `country` (optional): Country code (e.g., "US", "UK", "ID")
- `safesearch` (optional): Safe search level - "off", "moderate", "strict"
- `spellcheck` (optional): Enable spell checking (default: false)

**Returns:**
```typescript
{
  results: Array<{
    title: string,
    url: string,
    thumbnail: string,
    source: string,
    width?: number,
    height?: number
  }>,
  total: number
}
```

**Examples:**

1. **Basic web search:**
```typescript
const results = await search.web({
  search_query: "TypeScript vs JavaScript 2024",
  count: 5
});
return { count: results.total, results: results.results };
```

2. **Recent news with freshness filter:**
```typescript
const news = await search.web({
  search_query: "AI news",
  count: 10,
  freshness: "pw"  // Past week
});
return news.results;
```

3. **Basic image search:**
```typescript
const images = await search.image({
  search_query: "sunset over mountains",
  count: 5
});
return { count: images.total, images: images.results };
```

4. **Safe image search:**
```typescript
const images = await search.image({
  search_query: "nature photography",
  count: 10,
  safesearch: "strict"
});
return images.results;
```

**Important Notes:**
- Requires BRAVE_API_KEY environment variable
- Get API key from https://brave.com/search/api/
- Provides access to current web information
- Use freshness parameter to get recent results
`;

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
 * Search extension - combines web and image search
 */
// @ts-expect-error - Extension loader wraps this code in an async function
return {
  /**
   * Search the web for information
   *
   * Usage:
   * const results = await search.web({ search_query: 'latest AI news', count: 5 });
   */
  web: async (options: WebSearchOptions): Promise<WebSearchResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "search.web requires an options object. Usage: await search.web({ search_query: 'your query' })"
      );
    }

    if (!options.search_query) {
      throw new Error(
        "search.web requires 'search_query' parameter"
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

      params.append("safesearch", options.safesearch || "strict");

      if (options.freshness) {
        params.append("freshness", options.freshness);
      }

      if (options.text_decorrelation !== undefined) {
        params.append("text_decorrelation", String(options.text_decorrelation));
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

      const data = await response.json() as BraveWebSearchResponse;

      const webResults = data.web?.results || [];
      const transformedResults = webResults.map((item: BraveWebResult): TransformedWebResult => ({
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
    } catch (error: unknown) {
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Search for images
   *
   * Usage:
   * const images = await search.image({ search_query: 'cute cats', count: 10 });
   */
  image: async (options: ImageSearchOptions): Promise<ImageSearchResult> => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "search.image requires an options object. Usage: await search.image({ search_query: 'your query' })"
      );
    }

    if (!options.search_query) {
      throw new Error(
        "search.image requires 'search_query' parameter"
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

      const data = await response.json() as BraveImageSearchResponse;

      const imageResults = data.results || [];
      const transformedResults = imageResults.map((item: BraveImageResult): TransformedImageResult => ({
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
    } catch (error: unknown) {
      throw new Error(`Image search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
