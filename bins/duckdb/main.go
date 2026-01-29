package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config holds the configuration output
type Config struct {
	DuckDBPath string `json:"duckdb_path"`
}

func main() {
	// Determine project root (parent of bins/duckdb)
	execPath, err := os.Executable()
	if err != nil {
		failWithError("Failed to get executable path", err)
	}

	binsDuckdbDir := filepath.Dir(execPath)
	projectRoot := filepath.Dir(filepath.Dir(binsDuckdbDir))

	// DuckDB binary path
	duckdbBinPath := filepath.Join(projectRoot, "bins", "duckdb", "bin")

	// Ensure DuckDB is available
	duckdbPath, err := ensureDuckDB(duckdbBinPath)
	if err != nil {
		failWithError("Failed to ensure DuckDB", err)
	}

	// Output configuration as JSON
	config := Config{
		DuckDBPath: duckdbPath,
	}

	jsonOutput, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		failWithError("Failed to marshal config", err)
	}

	fmt.Println(string(jsonOutput))
}

func failWithError(message string, err error) {
	fmt.Fprintf(os.Stderr, "Error: %s: %v\n", message, err)
	os.Exit(1)
}
