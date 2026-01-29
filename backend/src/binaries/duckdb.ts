import { $ } from "bun";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Cache the duckdb path to avoid repeated lookups
let cachedDuckDBPath: string | null = null;
let cachedProjectRoot: string | null = null;

/**
 * Get the project root directory by traversing up from the current file
 */
function getProjectRoot(): string {
  if (cachedProjectRoot) {
    return cachedProjectRoot;
  }

  // Get the directory of the current module
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  // Traverse up to find project root (look for package.json or go.mod in parent dirs)
  let dir = currentDir;
  while (dir !== path.parse(dir).root) {
    // Check if we're at the project root (has bins/duckdb sibling)
    const binsDuckdbPath = path.join(dir, "..", "bins", "duckdb");
    if (fs.existsSync(binsDuckdbPath)) {
      cachedProjectRoot = path.resolve(dir, "..");
      return cachedProjectRoot;
    }
    dir = path.dirname(dir);
  }

  // Fallback to current working directory
  cachedProjectRoot = process.cwd();
  return cachedProjectRoot;
}

/**
 * Get the path to the duckdb-manager binary for the current platform
 */
function getManagerBinaryPath(): string {
  const projectRoot = getProjectRoot();
  const platform = process.platform;

  // Determine binary name
  let binaryName = "duckdb-manager";
  if (platform === "win32") {
    binaryName = "duckdb-manager.exe";
  }

  // Path to the manager binary
  const managerPath = path.join(projectRoot, "bins", "duckdb", binaryName);

  return managerPath;
}

/**
 * Get the path to the DuckDB executable.
 *
 * This function:
 * 1. First tries to find duckdb in the system PATH
 * 2. If not found, uses the duckdb-manager binary to download/locate it
 * 3. Caches the result for subsequent calls
 *
 * @returns The absolute path to the DuckDB executable
 * @throws Error if DuckDB cannot be found or downloaded
 */
export async function getDuckDBPath(): Promise<string> {
  // Return cached path if available
  if (cachedDuckDBPath) {
    return cachedDuckDBPath;
  }

  const projectRoot = getProjectRoot();
  const managerBinary = getManagerBinaryPath();

  // Check if manager binary exists
  if (!fs.existsSync(managerBinary)) {
    throw new Error(
      `DuckDB manager binary not found at ${managerBinary}. ` +
      `Please run: cd ${path.join(projectRoot, "bins", "duckdb")} && ./build.sh`
    );
  }

  try {
    // Run the manager to get DuckDB path
    const result = await $`${managerBinary}`.quiet();

    // Parse JSON output
    const config = JSON.parse(result.stdout.toString()) as { duckdb_path: string };

    if (!config.duckdb_path) {
      throw new Error("Invalid output from duckdb-manager: missing duckdb_path");
    }

    // Cache the path
    cachedDuckDBPath = config.duckdb_path;

    return cachedDuckDBPath;
  } catch (error: any) {
    throw new Error(
      `Failed to get DuckDB path: ${error.message}. ` +
      `Ensure DuckDB manager is built and executable.`
    );
  }
}

/**
 * Clear the cached DuckDB path (useful for testing or after updates)
 */
export function clearDuckDBCache(): void {
  cachedDuckDBPath = null;
}
