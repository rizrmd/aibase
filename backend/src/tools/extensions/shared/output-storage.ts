import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { PATHS } from "../../../config/paths";

// In-memory storage for smaller outputs (< 10MB)
const memoryStorage = new Map<string, any>();

// File storage directory for larger outputs
const STORAGE_DIR = PATHS.OUTPUT_STORAGE;

// Threshold for file vs memory storage (10MB)
const FILE_STORAGE_THRESHOLD = 10 * 1024 * 1024;

// TTL for stored outputs (1 hour)
const OUTPUT_TTL = 60 * 60 * 1000;

// Metadata for stored outputs
interface StoredOutputMetadata {
  id: string;
  convId: string;
  toolCallId: string;
  size: number;
  type: "memory" | "file";
  storedAt: number;
  dataType: string; // "array" | "object" | "string" | etc.
  rowCount?: number; // For arrays
}

const outputMetadata = new Map<string, StoredOutputMetadata>();

/**
 * Initialize storage directory
 */
async function ensureStorageDir() {
  if (!existsSync(STORAGE_DIR)) {
    await mkdir(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Generate unique output ID
 */
function generateOutputId(convId: string, toolCallId: string): string {
  return `${convId}-${toolCallId}-${Date.now()}`;
}

/**
 * Get file path for stored output
 */
function getFilePath(outputId: string): string {
  return join(STORAGE_DIR, `${outputId}.json`);
}

/**
 * Detect data type and row count
 */
function analyzeOutput(output: any): { dataType: string; rowCount?: number } {
  if (Array.isArray(output)) {
    return { dataType: "array", rowCount: output.length };
  }
  if (output === null) {
    return { dataType: "null" };
  }
  return { dataType: typeof output };
}

/**
 * Store large output and return metadata
 */
export async function storeOutput(
  output: any,
  convId: string,
  toolCallId: string
): Promise<StoredOutputMetadata> {
  await ensureStorageDir();

  const outputId = generateOutputId(convId, toolCallId);
  const serialized = JSON.stringify(output);
  const size = Buffer.byteLength(serialized, "utf8");
  const { dataType, rowCount } = analyzeOutput(output);

  const metadata: StoredOutputMetadata = {
    id: outputId,
    convId,
    toolCallId,
    size,
    type: size > FILE_STORAGE_THRESHOLD ? "file" : "memory",
    storedAt: Date.now(),
    dataType,
    rowCount,
  };

  if (metadata.type === "file") {
    // Store in file system
    const filePath = getFilePath(outputId);
    await writeFile(filePath, serialized, "utf8");
  } else {
    // Store in memory
    memoryStorage.set(outputId, output);
  }

  outputMetadata.set(outputId, metadata);

  // Schedule cleanup
  setTimeout(() => {
    cleanupOutput(outputId).catch(console.error);
  }, OUTPUT_TTL);

  return metadata;
}

/**
 * Retrieve stored output by ID
 */
export async function retrieveOutput(outputId: string): Promise<any> {
  const metadata = outputMetadata.get(outputId);

  if (!metadata) {
    throw new Error(`Output not found: ${outputId}`);
  }

  if (metadata.type === "memory") {
    const output = memoryStorage.get(outputId);
    if (output === undefined) {
      throw new Error(`Output expired: ${outputId}`);
    }
    return output;
  } else {
    // Read from file
    const filePath = getFilePath(outputId);
    if (!existsSync(filePath)) {
      throw new Error(`Output file not found: ${outputId}`);
    }
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  }
}

/**
 * Get metadata for stored output
 */
export function getOutputMetadata(outputId: string): StoredOutputMetadata | undefined {
  return outputMetadata.get(outputId);
}

/**
 * Cleanup a specific output
 */
async function cleanupOutput(outputId: string): Promise<void> {
  const metadata = outputMetadata.get(outputId);

  if (!metadata) {
    return;
  }

  if (metadata.type === "file") {
    const filePath = getFilePath(outputId);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } else {
    memoryStorage.delete(outputId);
  }

  outputMetadata.delete(outputId);
}

/**
 * Clear all outputs for a conversation
 */
export async function clearConversationOutputs(convId: string): Promise<void> {
  const outputIds = Array.from(outputMetadata.values())
    .filter((meta) => meta.convId === convId)
    .map((meta) => meta.id);

  await Promise.all(outputIds.map((id) => cleanupOutput(id)));
}

/**
 * Clear all expired outputs
 */
export async function clearExpiredOutputs(): Promise<void> {
  const now = Date.now();
  const expiredIds = Array.from(outputMetadata.values())
    .filter((meta) => now - meta.storedAt > OUTPUT_TTL)
    .map((meta) => meta.id);

  await Promise.all(expiredIds.map((id) => cleanupOutput(id)));
}

// Run cleanup periodically (every 10 minutes)
setInterval(() => {
  clearExpiredOutputs().catch(console.error);
}, 10 * 60 * 1000);
