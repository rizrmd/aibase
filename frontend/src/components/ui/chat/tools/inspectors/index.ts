/**
 * Inspectors Index
 * Exports and registers all inspector components
 */

import { registerInspector } from "../extension-inspector-registry";
import { PostgreSQLInspector } from "./postgresql-inspector";
import { DuckDBInspector } from "./duckdb-inspector";

// Register built-in inspectors
registerInspector('postgresql', PostgreSQLInspector);
registerInspector('duckdb', DuckDBInspector);

// Export for potential direct use
export { PostgreSQLInspector } from "./postgresql-inspector";
export { DuckDBInspector } from "./duckdb-inspector";
