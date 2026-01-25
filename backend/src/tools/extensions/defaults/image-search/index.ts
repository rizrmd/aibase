/**
 * Image Search Extension
 * Search for images using Brave Search API
 */

// Type definitions
interface ImageSearchOptions {
  search_query: string;
  count?: number;
  country?: string;
  safesearch?: "off" | "moderate" | "strict";
  spellcheck?: boolean;
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

interface TransformedImageResult {
  title: string;
  url: string;
  thumbnail: string;
  source: string;
  width?: number;
  height?: number;
}

interface ImageSearchResult {
  results: TransformedImageResult[];
  total: number;
}

/**
 * Context documentation for the image-search extension
 */
const context = () =>
  '' +
  '### Image Search Extension' +
  '' +
  'Search for images using Brave Search API.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### imageSearch(options)' +
  'Search for images.' +
  '`' + '`' + '`' + 'typescript' +
  'await imageSearch({' +
  '  search_query: "cute cats",' +
  '  count: 10,                    // Optional: number of results (default: 20)' +
  '  country: "US",                // Optional: country code' +
  '  safesearch: "moderate",        // Optional: "off", "moderate", "strict"' +
  '  spellcheck: true               // Optional: enable spell checking' +
  '});' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`search_query\\` (required): Search query string' +
  '- \\`count\\` (optional): Number of results to return (default: 20)' +
  '- \\`country\\` (optional): Country code (e.g., "US", "UK", "ID")' +
  '- \\`safesearch\\` (optional): Safe search level - "off", "moderate", "strict"' +
  '- \\`spellcheck\\` (optional): Enable spell checking (default: false)' +
  '' +
  '**Returns:**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  query: string,' +
  '  results: Array<{' +
  '    title: string,' +
  '    url: string,' +
  '    thumbnail: string,' +
  '    source: string' +
  '  }>' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Basic image search:**' +
  '`' + '`' + '`' + 'typescript' +
  'const images = await imageSearch({' +
  '  search_query: "sunset over mountains",' +
  '  count: 5' +
  '});' +
  'return { count: images.results.length, images: images.results };' +
  '`' + '`' + '`' +
  '' +
  '2. **Safe search for content filtering:**' +
  '`' + '`' + '`' + 'typescript' +
  'const images = await imageSearch({' +
  '  search_query: "nature photography",' +
  '  count: 10,' +
  '  safesearch: "strict"' +
  '});' +
  'return images.results;' +
  '`' + '`' + '`' +
  '' +
  '3. **Country-specific search:**' +
  '`' + '`' + '`' + 'typescript' +
  'const images = await imageSearch({' +
  '  search_query: "Indonesian food",' +
  '  count: 15,' +
  '  country: "ID"' +
  '});' +
  'return images.results;' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Requires BRAVE_API_KEY environment variable' +
  '- Get API key from https://brave.com/search/api/' +
  '- Returns thumbnail URLs and source information' +
  '- Images are returned from the Brave search index';

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
 * Image search extension
 */
// @ts-expect-error - Extension loader wraps this code in an async function
return {
  /**
   * Search for images
   *
   * Usage:
   * const images = await imageSearch({ search_query: 'cute cats', count: 10 });
   */
  imageSearch: async (options: ImageSearchOptions) => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "imageSearch requires an options object. Usage: await imageSearch({ search_query: 'your query' })"
      );
    }

    if (!options.search_query) {
      throw new Error(
        "imageSearch requires 'search_query' parameter"
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
