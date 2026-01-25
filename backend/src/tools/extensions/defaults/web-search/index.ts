/**
 * Web Search Extension
 * Search the web using Brave Search API
 */

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
