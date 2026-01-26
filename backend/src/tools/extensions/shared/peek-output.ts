import { retrieveOutput, getOutputMetadata } from "./output-storage";

export interface PeekResult {
  outputId: string;
  data: any;
  metadata: {
    totalSize: number;
    dataType: string;
    rowCount?: number;
    requestedOffset: number;
    requestedLimit: number;
    actualReturned: number;
    hasMore: boolean;
  };
}

/**
 * Peek at a specific range of stored output
 *
 * @param outputId - The ID of the stored output
 * @param offset - Starting position (row index for arrays, byte offset for strings)
 * @param limit - Number of items/bytes to return
 * @returns PeekResult with requested data and metadata
 *
 * @example
 * // Get rows 100-200 from a large array result
 * const result = await peek('conv123-tool456-789', 100, 100);
 * console.log(result.data); // Array of 100 rows
 * console.log(result.metadata.hasMore); // true if more data available
 */
export async function peek(
  outputId: string,
  offset: number = 0,
  limit: number = 100
): Promise<PeekResult> {
  // Validate parameters
  if (offset < 0) {
    throw new Error("Offset must be non-negative");
  }
  if (limit <= 0) {
    throw new Error("Limit must be positive");
  }

  // Get metadata
  const metadata = getOutputMetadata(outputId);
  if (!metadata) {
    throw new Error(`Output not found: ${outputId}`);
  }

  // Retrieve full output
  const fullOutput = await retrieveOutput(outputId);

  let data: any;
  let actualReturned: number;
  let hasMore: boolean;

  // Handle different data types
  if (Array.isArray(fullOutput)) {
    // Array: return slice
    const end = Math.min(offset + limit, fullOutput.length);
    data = fullOutput.slice(offset, end);
    actualReturned = data.length;
    hasMore = end < fullOutput.length;
  } else if (typeof fullOutput === "string") {
    // String: return substring
    const end = Math.min(offset + limit, fullOutput.length);
    data = fullOutput.substring(offset, end);
    actualReturned = data.length;
    hasMore = end < fullOutput.length;
  } else if (typeof fullOutput === "object" && fullOutput !== null) {
    // Object: return subset of keys
    const keys = Object.keys(fullOutput);
    const end = Math.min(offset + limit, keys.length);
    const selectedKeys = keys.slice(offset, end);
    data = {};
    for (const key of selectedKeys) {
      data[key] = fullOutput[key];
    }
    actualReturned = selectedKeys.length;
    hasMore = end < keys.length;
  } else {
    // Primitive types: return as-is (offset/limit don't apply)
    data = fullOutput;
    actualReturned = 1;
    hasMore = false;
  }

  return {
    outputId,
    data,
    metadata: {
      totalSize: metadata.size,
      dataType: metadata.dataType,
      rowCount: metadata.rowCount,
      requestedOffset: offset,
      requestedLimit: limit,
      actualReturned,
      hasMore,
    },
  };
}

/**
 * Get summary information about stored output without retrieving data
 */
export function peekInfo(outputId: string): any {
  const metadata = getOutputMetadata(outputId);
  if (!metadata) {
    throw new Error(`Output not found: ${outputId}`);
  }

  return {
    outputId: metadata.id,
    totalSize: metadata.size,
    sizeFormatted: formatBytes(metadata.size),
    dataType: metadata.dataType,
    rowCount: metadata.rowCount,
    storageType: metadata.type,
    storedAt: new Date(metadata.storedAt).toISOString(),
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
