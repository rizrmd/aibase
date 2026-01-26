/**
 * Peek Extension
 * Paginated access to large stored outputs
 */

import { peek, peekInfo } from "../../shared/peek-output";

// Type definitions
interface OutputMetadata {
  size: number;
  dataType: string;
  rowCount?: number;
}

interface PeekMetadata {
  totalSize: number;
  dataType: string;
  rowCount?: number;
  requestedOffset: number;
  requestedLimit: number;
  actualReturned: number;
  hasMore: boolean;
}

export interface PeekResult {
  outputId: string;
  data: unknown[] | string | Record<string, unknown>;
  metadata: PeekMetadata;
}

/**
 * Context documentation for the peek extension
 */
const context = () =>
  '' +
  '### Peek Extension' +
  '' +
  'Paginated access to large outputs that were stored from previous script executions.' +
  '' +
  '**Available Functions:**' +
  '' +
  '#### peek(outputId, offset, limit)' +
  'Retrieve a portion of stored output.' +
  '`' + '`' + '`' + 'typescript' +
  'await peek(' +
  '  outputId: string,    // ID of the stored output' +
  '  offset: number,      // Starting index (default: 0)' +
  '  limit: number        // Number of items to retrieve (default: 100)' +
  ');' +
  '`' + '`' + '`' +
  '' +
  '#### peekInfo(outputId)' +
  'Get metadata about stored output without retrieving data.' +
  '`' + '`' + '`' + 'typescript' +
  'await peekInfo(outputId: string);' +
  '`' + '`' + '`' +
  '' +
  '**Parameters:**' +
  '- \\`outputId\\` (required): The ID of the stored output (from previous script result)' +
  '- \\`offset\\` (optional): Starting index for pagination (default: 0)' +
  '- \\`limit\\` (optional): Number of items to return (default: 100)' +
  '' +
  '**Returns (peek):**' +
  '`' + '`' + '`' + 'typescript' +
  '{' +
  '  outputId: string,' +
  '  data: Array<unknown> | string | Record<string, unknown>,  // The paginated data' +
  '  metadata: {' +
  '    totalSize: number,         // Total size in bytes' +
  '    dataType: string,          // "array" or "string"' +
  '    rowCount?: number,         // Total rows (if array)' +
  '    requestedOffset: number,   // Your offset parameter' +
  '    requestedLimit: number,    // Your limit parameter' +
  '    actualReturned: number,    // Actual items returned' +
  '    hasMore: boolean           // Whether more data available' +
  '  }' +
  '}' +
  '`' + '`' + '`' +
  '' +
  '**Examples:**' +
  '' +
  '1. **Retrieve first page:**' +
  '`' + '`' + '`' + 'typescript' +
  'const page1 = await peek("conv123-tool456-789", 0, 100);' +
  'return {' +
  '  data: page1.data,' +
  '  hasMore: page1.metadata.hasMore' +
  '};' +
  '`' + '`' + '`' +
  '' +
  '2. **Retrieve next page:**' +
  '`' + '`' + '`' + 'typescript' +
  'const page2 = await peek("conv123-tool456-789", 100, 100);' +
  'return page2.data;' +
  '`' + '`' + '`' +
  '' +
  '3. **Get output info first:**' +
  '`' + '`' + '`' + 'typescript' +
  'const info = await peekInfo("conv123-tool456-789");' +
  'return {' +
  '  totalRows: info.rowCount,' +
  '  totalSize: info.totalSize,' +
  '  dataType: info.dataType' +
  '};' +
  '`' + '`' + '`' +
  '' +
  '4. **Paginate through large dataset:**' +
  '`' + '`' + '`' + 'typescript' +
  'const offset = 0;' +
  'const limit = 50;' +
  'const page = await peek("conv123-tool456-789", offset, limit);' +
  'return {' +
  '  offset: offset,' +
  '  limit: limit,' +
  '  returned: page.metadata.actualReturned,' +
  '  hasMore: page.metadata.hasMore,' +
  '  data: page.data' +
  '};' +
  '`' + '`' + '`' +
  '' +
  '**Important Notes:**' +
  '- Used when script results are too large and were stored' +
  '- Output ID is returned in the truncated result as \\`_outputId\\`' +
  '- Use peekInfo to check metadata before retrieving data' +
  '- Supports both array and string data types' +
  '- Perfect for processing large query results in batches';

/**
 * Peek extension
 */
// @ts-expect-error - Extension loader wraps this code in an async function
return {
  peek,
  peekInfo,
};
