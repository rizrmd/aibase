package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// Platform represents OS and architecture
type Platform struct {
	OS   string
	Arch string
}

// getCurrentPlatform detects the current OS and architecture
func getCurrentPlatform() Platform {
	return Platform{
		OS:   runtime.GOOS,
		Arch: runtime.GOARCH,
	}
}

// getDuckDBDownloadURL returns the DuckDB download URL for the current platform
func getDuckDBDownloadURL(platform Platform) (string, error) {
	// DuckDB latest stable version
	version := "v1.1.3"

	var urlTemplate string

	switch {
	case platform.OS == "darwin" && platform.Arch == "arm64":
		urlTemplate = "https://github.com/duckdb/duckdb/releases/download/%s/duckdb_cli-osx-aarch64.zip"
	case platform.OS == "darwin" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/duckdb/duckdb/releases/download/%s/duckdb_cli-osx-universal.zip"
	case platform.OS == "linux" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/duckdb/duckdb/releases/download/%s/duckdb_cli-linux-amd64.zip"
	case platform.OS == "linux" && platform.Arch == "arm64":
		urlTemplate = "https://github.com/duckdb/duckdb/releases/download/%s/duckdb_cli-linux-aarch64.zip"
	case platform.OS == "windows" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/duckdb/duckdb/releases/download/%s/duckdb_cli-windows-amd64.zip"
	default:
		return "", fmt.Errorf("unsupported platform for DuckDB: %s/%s", platform.OS, platform.Arch)
	}

	return fmt.Sprintf(urlTemplate, version), nil
}

// ensureDuckDB downloads DuckDB if it doesn't exist in PATH or locally
func ensureDuckDB(duckdbBinPath string) (string, error) {
	platform := getCurrentPlatform()

	// Determine executable name
	execName := "duckdb"
	if platform.OS == "windows" {
		execName = "duckdb.exe"
	}

	// First, check if duckdb is available in system PATH
	systemDuckDB, err := exec.LookPath(execName)
	if err == nil {
		// Found in PATH, return system duckdb path
		return systemDuckDB, nil
	}

	duckdbExecutable := filepath.Join(duckdbBinPath, execName)

	// Check if already exists in local path
	if _, err := os.Stat(duckdbExecutable); err == nil {
		return duckdbExecutable, nil
	}

	// Need to download - create directory
	if err := os.MkdirAll(duckdbBinPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create duckdb bin directory: %w", err)
	}

	// Get download URL
	downloadURL, err := getDuckDBDownloadURL(platform)
	if err != nil {
		return "", err
	}

	fmt.Printf("Downloading DuckDB from %s\n", downloadURL)

	// Download file
	archivePath := filepath.Join(duckdbBinPath, "duckdb.zip")
	if err := downloadFile(downloadURL, archivePath); err != nil {
		return "", fmt.Errorf("failed to download DuckDB: %w", err)
	}
	defer os.Remove(archivePath)

	// Extract zip
	if err := extractZip(archivePath, duckdbBinPath); err != nil {
		return "", fmt.Errorf("failed to extract DuckDB: %w", err)
	}

	// Make executable (Unix-like systems)
	if platform.OS != "windows" {
		if err := os.Chmod(duckdbExecutable, 0755); err != nil {
			return "", fmt.Errorf("failed to chmod duckdb: %w", err)
		}
	}

	fmt.Printf("DuckDB installed to %s\n", duckdbExecutable)
	return duckdbExecutable, nil
}

// downloadFile downloads a file from URL to destination
func downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// extractZip extracts a ZIP archive to destination
func extractZip(archivePath, dest string) error {
	r, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer r.Close()

	// Use Bun to extract since we're in a Bun project
	// This avoids external dependencies
	cmd := exec.Command("unzip", "-o", archivePath, "-d", dest)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
