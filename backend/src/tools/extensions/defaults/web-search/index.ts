/**
 * Web Search Extension
 * Search the web using Brave Search API
 */

/**
 * Context documentation for the web-search extension
 */
export const context = () => `
### Web Search Extension

Search the web for current information using Brave Search API.

**Available Functions:**

#### webSearch(options)
Search the web.
\`\`\`typescript
await webSearch({
  search_query: "latest AI developments 2024",
  count: 10,                   // Optional: number of results (default: 10)
  country: "US",               // Optional: country code
  search_lang: "en",           // Optional: language code
  safesearch: "moderate",      // Optional: "off", "moderate", "strict"
  freshness: "py",             // Optional: time filter - "pd", "pw", "pm", "py", "pn", "pw"
  text_decorrelation: true      // Optional: deduplicate results
});
\`\`\`

**Parameters:**
- \`search_query\` (required): Search query string
- \`count\` (optional): Number of results to return (default: 10)
- \`country\` (optional): Country code (e.g., "US", "UK", "ID")
- \`search_lang\` (optional): Language code (e.g., "en", "id", "es")
- \`safesearch\` (optional): Safe search level - "off", "moderate", "strict"
- \`freshness\` (optional): Time filter
  - \`pd\`: past day
  - \`pw\`: past week
  - \`pm\`: past month
  - \`py\`: past year
  - \`pn\`: no limit
- \`text_decorrelation\` (optional): Remove similar results (default: false)

**Returns:**
\`\`\`typescript
{
  query: string,
  results: Array<{
    title: string,
    url: string,
    description: string,
    published: string
  }>
}
\`\`\`

**Examples:**

1. **Basic web search:**
\`\`\`typescript
const results = await webSearch({
  search_query: "TypeScript vs JavaScript 2024",
  count: 5
});
return { count: results.results.length, results: results.results };
\`\`\`

2. **Recent news with freshness filter:**
\`\`\`typescript
const news = await webSearch({
  search_query: "AI news",
  count: 10,
  freshness: "pw"  // Past week
});
return news.results;
\`\`\`

3. **Country-specific search:**
\`\`\`typescript
const results = await webSearch({
  search_query: "resep masakan enak",
  count: 10,
  country: "ID",
  search_lang: "id"
});
return results.results;
\`\`\`

4. **Safe search enabled:**
\`\`\`typescript
const results = await webSearch({
  search_query: "educational resources",
  count: 15,
  safesearch: "strict"
});
return results.results;
\`\`\`

**Important Notes:**
- Requires BRAVE_API_KEY environment variable
- Get API key from https://brave.com/search/api/
- Provides access to current web information
- Great for finding recent articles, documentation, and news
- Use freshness parameter to get recent results
`;

/**
 * Get API key from environment
 */
function getBraveApiKey() {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BRAVE_API_KEY environment variable is not set. Get your API key from https://brave.com/search/api/"
    );
  }
  return apiKey;
}

/**
 * Web search extension
 */
const webSearchExtension = {
  /**
   * Search the web for information
   *
   * Usage:
   * const results = await webSearch({ search_query: 'latest AI news', count: 5 });
   */
  webSearch: async (options) => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "webSearch requires an options object. Usage: await webSearch({ search_query: 'your query' })"
      );
    }

    if (!options.search_query) {
      throw new Error(
        "webSearch requires 'search_query' parameter"
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

      const data = await response.json();

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
    } catch (error) {
      throw new Error(`Web search failed: ${error.message}`);
    }
  },
};

return webSearchExtension;
