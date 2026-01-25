/**
 * PostgreSQL Extension
 * Query PostgreSQL databases with secure connection management
 */

/**
 * PostgreSQL extension
 */
const postgresqlExtension = {
  /**
   * Query PostgreSQL database
   *
   * Usage:
   * const result = await postgresql({
   *   query: 'SELECT * FROM users WHERE active = true LIMIT 10',
   *   connectionUrl: memory.read('database', 'postgresql_url')
   * });
   */
  postgresql: async (options) => {
    if (!options || typeof options !== "object") {
      throw new Error(
        "postgresql requires an options object. Usage: await postgresql({ query: 'SELECT * FROM users', connectionUrl: '...' })"
      );
    }

    if (!options.query) {
      throw new Error(
        "postgresql requires 'query' parameter. Usage: await postgresql({ query: 'SELECT * FROM users', connectionUrl: '...' })"
      );
    }

    if (!options.connectionUrl) {
      throw new Error(
        "postgresql requires 'connectionUrl' parameter"
      );
    }

    const format = options.format || "json";
    const timeout = options.timeout || 30000;
    const startTime = Date.now();

    try {
      // Import SQL dynamically
      const { SQL } = await import('bun');

      // Create PostgreSQL connection using Bun's SQL
      const db = new SQL(options.connectionUrl);

      // Execute query with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
      );

      // Execute the query using Bun's SQL API
      const queryPromise = (async () => {
        return await db.unsafe(options.query);
      })();

      const result = await Promise.race([
        queryPromise,
        timeoutPromise,
      ]);

      const executionTime = Date.now() - startTime;

      // Return results based on format
      if (format === "json") {
        // Bun's SQL returns arrays of objects
        const dataArray = Array.isArray(result) ? result : [result];

        const extensionResult = {
          data: dataArray,
          rowCount: dataArray.length,
          executionTime,
          query: options.query,
        };

        // Broadcast inspection data if __broadcastInspection is available
        if (globalThis.__broadcastInspection) {
          globalThis.__broadcastInspection('postgresql', {
            ...extensionResult,
          });
        }

        return extensionResult;
      } else {
        // Raw format
        const extensionResult = {
          raw: result,
          executionTime,
          query: options.query,
        };

        if (globalThis.__broadcastInspection) {
          globalThis.__broadcastInspection('postgresql', {
            ...extensionResult,
          });
        }

        return extensionResult;
      }
    } catch (error) {
      throw new Error(`PostgreSQL query failed: ${error.message}`);
    }
  },
};

return postgresqlExtension;
