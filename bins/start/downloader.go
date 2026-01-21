package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
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

// getBunDownloadURL returns the Bun download URL for the current platform
func getBunDownloadURL(platform Platform) (string, error) {
	version := "1.1.38" // Latest stable Bun version

	var urlTemplate string

	switch {
	case platform.OS == "darwin" && platform.Arch == "arm64":
		urlTemplate = "https://github.com/oven-sh/bun/releases/download/bun-v%s/bun-darwin-aarch64.zip"
	case platform.OS == "darwin" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/oven-sh/bun/releases/download/bun-v%s/bun-darwin-x64.zip"
	case platform.OS == "linux" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/oven-sh/bun/releases/download/bun-v%s/bun-linux-x64.zip"
	case platform.OS == "linux" && platform.Arch == "arm64":
		urlTemplate = "https://github.com/oven-sh/bun/releases/download/bun-v%s/bun-linux-aarch64.zip"
	case platform.OS == "windows" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/oven-sh/bun/releases/download/bun-v%s/bun-windows-x64.zip"
	default:
		return "", fmt.Errorf("unsupported platform: %s/%s", platform.OS, platform.Arch)
	}

	return fmt.Sprintf(urlTemplate, version), nil
}

// getQdrantDownloadURL returns the Qdrant download URL for the current platform
func getQdrantDownloadURL(platform Platform) (string, error) {
	version := "v1.11.0"

	var urlTemplate string

	switch {
	case platform.OS == "darwin" && platform.Arch == "arm64":
		urlTemplate = "https://github.com/qdrant/qdrant/releases/download/%s/qdrant-aarch64-apple-darwin.tar.gz"
	case platform.OS == "darwin" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/qdrant/qdrant/releases/download/%s/qdrant-x86_64-apple-darwin.tar.gz"
	case platform.OS == "linux" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/qdrant/qdrant/releases/download/%s/qdrant-x86_64-unknown-linux-musl.tar.gz"
	case platform.OS == "windows" && platform.Arch == "amd64":
		urlTemplate = "https://github.com/qdrant/qdrant/releases/download/%s/qdrant-x86_64-pc-windows-msvc.zip"
	default:
		return "", fmt.Errorf("unsupported platform for Qdrant: %s/%s", platform.OS, platform.Arch)
	}

	return fmt.Sprintf(urlTemplate, version), nil
}

// ensureBun downloads Bun if it doesn't exist
func ensureBun(bunBinPath string) (string, error) {
	platform := getCurrentPlatform()

	// Determine executable name
	execName := "bun"
	if platform.OS == "windows" {
		execName = "bun.exe"
	}

	// First, check if bun is available in system PATH (e.g., in Docker)
	systemBun, err := exec.LookPath(execName)
	if err == nil {
		// Found in PATH, use system bun
		return systemBun, nil
	}

	bunExecutable := filepath.Join(bunBinPath, execName)

	// Check if already exists in local path
	if _, err := os.Stat(bunExecutable); err == nil {
		return bunExecutable, nil
	}

	// Get download URL
	downloadURL, err := getBunDownloadURL(platform)
	if err != nil {
		return "", err
	}

	// Download file
	archivePath := filepath.Join(bunBinPath, "bun.zip")
	if err := downloadFile(downloadURL, archivePath); err != nil {
		return "", fmt.Errorf("failed to download Bun: %w", err)
	}
	defer os.Remove(archivePath)

	// Extract zip
	if err := extractZip(archivePath, bunBinPath); err != nil {
		return "", fmt.Errorf("failed to extract Bun: %w", err)
	}

	// Bun zip contains bun-{platform}/bun, need to move it
	// Find the bun executable
	bunDir, err := findBunExecutable(bunBinPath)
	if err != nil {
		return "", err
	}

	// Move bun executable to bunBinPath root
	srcBun := filepath.Join(bunBinPath, bunDir, execName)
	if err := os.Rename(srcBun, bunExecutable); err != nil {
		return "", fmt.Errorf("failed to move bun executable: %w", err)
	}

	// Remove extracted directory
	os.RemoveAll(filepath.Join(bunBinPath, bunDir))

	// Make executable (Unix-like systems)
	if platform.OS != "windows" {
		if err := os.Chmod(bunExecutable, 0755); err != nil {
			return "", fmt.Errorf("failed to chmod bun: %w", err)
		}
	}

	return bunExecutable, nil
}

// findBunExecutable finds the bun directory in extracted archive
func findBunExecutable(bunBinPath string) (string, error) {
	entries, err := os.ReadDir(bunBinPath)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), "bun-") {
			return entry.Name(), nil
		}
	}

	return "", fmt.Errorf("bun directory not found after extraction")
}

// ensureServiceBinaries ensures all service binaries are downloaded
func ensureServiceBinaries(qdrantDir string) (string, error) {
	// Ensure Qdrant
	qdrantPath, err := ensureQdrant(qdrantDir)
	if err != nil {
		return "", err
	}

	return qdrantPath, nil
}

// ensureQdrant downloads Qdrant if it doesn't exist
func ensureQdrant(qdrantDir string) (string, error) {
	platform := getCurrentPlatform()

	// Determine executable name
	execName := "qdrant"
	if platform.OS == "windows" {
		execName = "qdrant.exe"
	}

	// Platform string for path
	platformStr := fmt.Sprintf("%s-%s", platform.OS, platform.Arch)
	if platform.Arch == "amd64" {
		platformStr = fmt.Sprintf("%s-x64", platform.OS)
	} else if platform.Arch == "arm64" && platform.OS == "darwin" {
		platformStr = "darwin-arm64"
	}

	qdrantBinPath := filepath.Join(qdrantDir, "bin", platformStr, execName)

	// Check if already exists
	if _, err := os.Stat(qdrantBinPath); err == nil {
		return qdrantBinPath, nil
	}

	// Get download URL
	downloadURL, err := getQdrantDownloadURL(platform)
	if err != nil {
		return "", err
	}

	// Create bin directory
	binDir := filepath.Dir(qdrantBinPath)
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create qdrant bin directory: %w", err)
	}

	// Download file
	var archivePath string
	if platform.OS == "windows" {
		archivePath = filepath.Join(binDir, "qdrant.zip")
	} else {
		archivePath = filepath.Join(binDir, "qdrant.tar.gz")
	}

	if err := downloadFile(downloadURL, archivePath); err != nil {
		return "", fmt.Errorf("failed to download Qdrant: %w", err)
	}
	defer os.Remove(archivePath)

	// Extract archive
	if platform.OS == "windows" {
		if err := extractZip(archivePath, binDir); err != nil {
			return "", fmt.Errorf("failed to extract Qdrant: %w", err)
		}
	} else {
		if err := extractTarGz(archivePath, binDir); err != nil {
			return "", fmt.Errorf("failed to extract Qdrant: %w", err)
		}
	}

	// Make executable (Unix-like systems)
	if platform.OS != "windows" {
		if err := os.Chmod(qdrantBinPath, 0755); err != nil {
			return "", fmt.Errorf("failed to chmod qdrant: %w", err)
		}
	}

	return qdrantBinPath, nil
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
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		fpath := filepath.Join(dest, f.Name)

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}

		if err = os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()

		if err != nil {
			return err
		}
	}

	return nil
}

// extractTarGz extracts a .tar.gz archive to destination
func extractTarGz(archivePath, dest string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzr, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		target := filepath.Join(dest, header.Name)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_RDWR, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tr); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()
		}
	}

	return nil
}
