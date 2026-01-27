package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"github.com/fatih/color"
)

const version = "1.0.0"

func showProgress(step int, total int, description string) {
	// Guard against invalid inputs
	if total <= 0 {
		total = 1
	}
	if step < 0 {
		step = 0
	}
	if step > total {
		step = total
	}

	percentage := (step * 100) / total
	barWidth := 40
	filled := (percentage * barWidth) / 100

	// Ensure filled and empty are within valid range
	if filled < 0 {
		filled = 0
	}
	if filled > barWidth {
		filled = barWidth
	}

	empty := barWidth - filled
	if empty < 0 {
		empty = 0
	}

	bar := strings.Repeat("█", filled) + strings.Repeat("░", empty)

	// Clear line and print progress with cyan color (ANSI code: \033[36m)
	fmt.Printf("\r\033[K\033[36m[%s] %d%% - %s\033[0m", bar, percentage, description)

	if step == total {
		fmt.Println()
	}
}

func isFeatureEnabled(envVar string) bool {
	value := strings.ToLower(os.Getenv(envVar))
	return value == "true" || value == "1" || value == "yes"
}

// loadEnvFileToOsEnv loads a .env file and sets the values in os.Environ()
func loadEnvFileToOsEnv(envPath string) error {
	// Read the .env file
	content, err := os.ReadFile(envPath)
	if err != nil {
		return err
	}

	// Parse each line and set environment variables
	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Parse KEY=VALUE
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			// Remove quotes if present
			value = strings.Trim(value, "\"'")
			os.Setenv(key, value)
		}
	}

	return nil
}

func main() {
	color.Cyan("AIBase Development Environment v%s\n", version)
	color.Cyan("=====================================\n\n")

	// Get project root early to load .env file
	projectRoot, err := getProjectRoot()
	if err != nil {
		color.Red("Error: %v\n", err)
		os.Exit(1)
	}

	// Load .env file from project root to get feature flags
	envFile := filepath.Join(projectRoot, ".env")
	if _, err := os.Stat(envFile); err == nil {
		loadEnvFileToOsEnv(envFile)
	}

	// Check which features are enabled (now reading from loaded .env)
	enableAimeow := isFeatureEnabled("AIMEOW")
	enableQdrant := isFeatureEnabled("QDRANT")

	// Calculate total steps based on enabled features
	// Base steps: Bun, Dependencies, Frontend = 3
	// Optional: AIMEOW (+1), Qdrant (+1), Start processes (+1)
	totalSteps := 5 // Base + start processes
	if enableAimeow {
		totalSteps++
	}
	if enableQdrant {
		totalSteps++
	}

	currentStep := 0

	// Project root was already loaded above

	// Setup paths
	dataDir := filepath.Join(projectRoot, "data")
	runtimeDir := filepath.Join(projectRoot, "runtime")
	bunBinPath := filepath.Join(runtimeDir, "bun")
	qdrantBinDir := filepath.Join(runtimeDir, "qdrant")

	// Create necessary directories
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		color.Red("Error creating runtime directory: %v\n", err)
		os.Exit(1)
	}
	if err := os.MkdirAll(bunBinPath, 0755); err != nil {
		color.Red("Error creating bun directory: %v\n", err)
		os.Exit(1)
	}
	if enableQdrant {
		if err := os.MkdirAll(qdrantBinDir, 0755); err != nil {
			color.Red("Error creating qdrant directory: %v\n", err)
			os.Exit(1)
		}
	}

	// Step 1: Download Bun if not exists
	currentStep++
	showProgress(currentStep, totalSteps, "Checking Bun installation...")
	bunExecutable, err := ensureBun(bunBinPath)
	if err != nil {
		fmt.Println()
		color.Red("Error ensuring Bun: %v\n", err)
		os.Exit(1)
	}

	// Step 2: Install dependencies for backend and frontend
	currentStep++
	showProgress(currentStep, totalSteps, "Installing dependencies...")
	if err := installDependencies(projectRoot, bunExecutable); err != nil {
		fmt.Println()
		color.Red("Error installing dependencies: %v\n", err)
		os.Exit(1)
	}

	// Step 3: Build frontend
	currentStep++
	showProgress(currentStep, totalSteps, "Building frontend...")
	if err := buildFrontend(projectRoot, bunExecutable); err != nil {
		fmt.Println()
		color.Red("Error building frontend: %v\n", err)
		os.Exit(1)
	}

	// Step 4: Build aimeow WhatsApp service (if enabled)
	var aimeowBinary string
	if enableAimeow {
		currentStep++
		showProgress(currentStep, totalSteps, "Building WhatsApp service...")
		var err error
		aimeowBinary, err = buildAimeow(projectRoot)
		if err != nil {
			fmt.Println()
			color.Red("Error building aimeow: %v\n", err)
			os.Exit(1)
		}
	}

	// Step 5: Download service binaries (Qdrant, if enabled)
	var qdrantBinary string
	if enableQdrant {
		currentStep++
		showProgress(currentStep, totalSteps, "Checking service binaries...")
		var err error
		qdrantBinary, err = ensureServiceBinaries(qdrantBinDir)
		if err != nil {
			fmt.Println()
			color.Red("Error ensuring service binaries: %v\n", err)
			os.Exit(1)
		}
	}

	// Determine ports based on OS
	var backendPort, qdrantHttpPort, qdrantGrpcPort string
	if runtime.GOOS == "windows" {
		backendPort = "3678"
		qdrantHttpPort = "3679"
		qdrantGrpcPort = "3680"
	} else {
		backendPort = "5040"
		qdrantHttpPort = "6333"
		qdrantGrpcPort = "6334"
	}

	// WhatsApp service port
	whatsappPort := "7031"

	// Clean up any processes using our ports
	portsToKill := []string{backendPort}
	if enableQdrant {
		portsToKill = append(portsToKill, qdrantHttpPort, qdrantGrpcPort)
	}
	if enableAimeow {
		portsToKill = append(portsToKill, whatsappPort)
	}
	killProcessesOnPorts(portsToKill...)

	// Step 6: Start all processes
	currentStep++
	showProgress(currentStep, totalSteps, "Starting services...")
	orch := NewOrchestrator(projectRoot, bunExecutable)

	// Add Qdrant service (if enabled)
	if enableQdrant {
		qdrantDataDir := filepath.Join(dataDir, "services", "qdrant")
		qdrantStoragePath := filepath.Join(qdrantDataDir, "storage")
		qdrantLogsPath := filepath.Join(dataDir, "logs", "qdrant")

		// Create qdrant directories
		os.MkdirAll(qdrantStoragePath, 0755)
		os.MkdirAll(qdrantLogsPath, 0755)

		// Create minimal config file to suppress warnings
		qdrantConfigDir := filepath.Join(qdrantDataDir, "config")
		os.MkdirAll(qdrantConfigDir, 0755)
		createQdrantConfig(qdrantConfigDir, qdrantStoragePath)

		qdrantEnv := []string{
			"QDRANT__SERVICE__HTTP_PORT=" + qdrantHttpPort,
			"QDRANT__SERVICE__GRPC_PORT=" + qdrantGrpcPort,
			fmt.Sprintf("QDRANT__STORAGE__STORAGE_PATH=%s", qdrantStoragePath),
		}
		orch.AddProcess("qdrant", qdrantDataDir, qdrantBinary, []string{}, qdrantEnv, qdrantLogsPath)
	}

	// Backend serves the built frontend on port 5040
	// Backend runs from project root so data/ is accessible
	// Logs go to data/logs/backend/
	backendLogsPath := filepath.Join(dataDir, "logs", "backend")
	os.MkdirAll(backendLogsPath, 0755)

	// envFile was already loaded at startup
	backendEnv := []string{
		"NODE_ENV=production",
	}
	if enableAimeow {
		backendEnv = append(backendEnv, "AIMEOW=true")
	}
	if enableQdrant {
		backendEnv = append(backendEnv, "QDRANT=true")
	}
	orch.AddProcess("backend", projectRoot, bunExecutable, []string{"--env-file=" + envFile, "run", "backend/src/server/index.ts"}, backendEnv, backendLogsPath)

	// WhatsApp service (aimeow) - using new structure: data/services/whatsapp/
	// Logs go to data/logs/whatsapp/
	if enableAimeow {
		whatsappLogsPath := filepath.Join(dataDir, "logs", "whatsapp")
		whatsappDataDir := filepath.Join(dataDir, "services", "whatsapp")
		whatsappFilesDir := filepath.Join(whatsappDataDir, "files")
		os.MkdirAll(whatsappLogsPath, 0755)
		os.MkdirAll(whatsappFilesDir, 0755)

		whatsappEnv := []string{
			"PORT=" + whatsappPort,
			"BASE_URL=http://localhost:" + whatsappPort,
			"CALLBACK_URL=http://localhost:" + backendPort + "/api/whatsapp/webhook",
			"DATA_DIR=.", // Use current working directory (data/services/whatsapp) for data storage
		}
		orch.AddProcess("whatsapp", whatsappDataDir, aimeowBinary, []string{}, whatsappEnv, whatsappLogsPath)
	}

	// Start all processes
	if err := orch.Start(); err != nil {
		fmt.Println()
		color.Red("Error starting processes: %v\n", err)
		os.Exit(1)
	}

	// Step 7: All services ready
	currentStep++
	showProgress(currentStep, totalSteps, "All services ready!")
	fmt.Println()

	// Determine display URL based on OS
	var displayURL string
	if runtime.GOOS == "windows" {
		displayURL = "http://localhost:3678"
	} else {
		displayURL = "http://localhost:5040"
	}

	color.Green("\n✓ All services started successfully\n")
	color.Cyan("\n→ Backend URL: %s\n", displayURL)
	if enableAimeow {
		color.Cyan("→ WhatsApp API: http://localhost:%s\n", whatsappPort)
	}
	color.Cyan("\nPress Ctrl+C to stop all services\n\n")

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	<-sigChan

	color.Yellow("\n\n→ Shutting down...\n")
	if err := orch.Stop(); err != nil {
		color.Red("Error during shutdown: %v\n", err)
		os.Exit(1)
	}

	color.Green("✓ Shutdown complete\n")
}

// installDependencies installs dependencies for backend and frontend
func installDependencies(projectRoot, bunExecutable string) error {
	// Install backend dependencies
	backendDir := filepath.Join(projectRoot, "backend")

	cmd := exec.Command(bunExecutable, "install")
	cmd.Dir = backendDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("backend install failed: %w\n%s", err, string(output))
	}

	// Install frontend dependencies (skip if in Docker/production where dist is pre-built)
	if os.Getenv("SKIP_FRONTEND_INSTALL") == "1" {
		fmt.Println("  Skipping frontend dependency installation (SKIP_FRONTEND_INSTALL=1)")
		return nil
	}

	frontendDir := filepath.Join(projectRoot, "frontend")

	// Check if frontend directory exists
	if _, err := os.Stat(frontendDir); os.IsNotExist(err) {
		fmt.Println("  Skipping frontend dependency installation (frontend directory not found)")
		return nil
	}

	cmd = exec.Command(bunExecutable, "install")
	cmd.Dir = frontendDir
	output, err = cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("frontend install failed: %w\n%s", err, string(output))
	}

	return nil
}

// buildFrontend builds the frontend for production (only if needed)
func buildFrontend(projectRoot, bunExecutable string) error {
	frontendDir := filepath.Join(projectRoot, "frontend")
	distDir := filepath.Join(frontendDir, "dist")

	// Check if dist directory exists
	distInfo, err := os.Stat(distDir)
	if err == nil && distInfo.IsDir() {
		// Dist exists, check if source files are newer
		needsRebuild, err := checkIfRebuildNeeded(frontendDir, distDir)
		if err != nil {
			// If we can't determine, rebuild to be safe
			needsRebuild = true
		}
		if !needsRebuild {
			return nil
		}
	}

	// Load .env file to get PUBLIC_BASE_PATH
	envMap, err := loadEnvFile(filepath.Join(projectRoot, ".env"))
	if err != nil {
		// If .env doesn't exist or can't be read, continue without it
		envMap = make(map[string]string)
	}

	// Build frontend for production with environment variables
	cmd := exec.Command(bunExecutable, "run", "build")
	cmd.Dir = frontendDir

	// Set up environment with .env variables for the build
	// Inherit parent process environment and add our custom variables
	cmd.Env = append(os.Environ(), envToSlice(envMap)...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("frontend build failed: %w\n%s", err, string(output))
	}

	return nil
}

// checkIfRebuildNeeded checks if source files are newer than dist
func checkIfRebuildNeeded(frontendDir, distDir string) (bool, error) {
	// Get the oldest file in dist directory
	var oldestDistTime int64 = 9999999999

	err := filepath.Walk(distDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && info.ModTime().Unix() < oldestDistTime {
			oldestDistTime = info.ModTime().Unix()
		}
		return nil
	})
	if err != nil {
		return true, err
	}

	// Check if any source file is newer than the oldest dist file
	srcDirs := []string{"src", "public", "index.html", "vite.config.ts", "package.json"}

	for _, srcPath := range srcDirs {
		fullPath := filepath.Join(frontendDir, srcPath)
		info, err := os.Stat(fullPath)
		if err != nil {
			continue // Skip if doesn't exist
		}

		if info.IsDir() {
			// Walk directory
			err = filepath.Walk(fullPath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return err
				}
				if !info.IsDir() && info.ModTime().Unix() > oldestDistTime {
					return fmt.Errorf("rebuild needed")
				}
				return nil
			})
			if err != nil && err.Error() == "rebuild needed" {
				return true, nil
			}
		} else {
			// Single file
			if info.ModTime().Unix() > oldestDistTime {
				return true, nil
			}
		}
	}

	return false, nil
}

// createQdrantConfig creates a minimal config file for Qdrant to suppress warnings
func createQdrantConfig(configDir, storagePath string) {
	configPath := filepath.Join(configDir, "config.yaml")
	devConfigPath := filepath.Join(configDir, "development.yaml")

	// Minimal config content
	configContent := `service:
  http_port: 6333
  grpc_port: 6334

storage:
  storage_path: ` + storagePath + `
`

	// Create main config if it doesn't exist
	if _, err := os.Stat(configPath); err != nil {
		os.WriteFile(configPath, []byte(configContent), 0644)
	}

	// Create development config if it doesn't exist (can be empty)
	if _, err := os.Stat(devConfigPath); err != nil {
		os.WriteFile(devConfigPath, []byte("# Development environment config\n"), 0644)
	}
}

// killProcessesOnPorts kills any processes using our required ports
func killProcessesOnPorts(ports ...string) {
	for _, port := range ports {
		killProcessOnPort(port)
	}
}
func killProcessOnPort(port string) {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Windows: use netstat and taskkill
		cmd = exec.Command("cmd", "/C", fmt.Sprintf("for /f \"tokens=5\" %%a in ('netstat -aon ^| findstr :%s') do taskkill /F /PID %%a", port))
	} else {
		// Unix-like (macOS, Linux): use lsof and kill
		cmd = exec.Command("sh", "-c", fmt.Sprintf("lsof -ti :%s | xargs -r kill -9 2>/dev/null || true", port))
	}

	// Run command silently - ignore errors if no process is found
	cmd.Run()
}

// getProjectRoot returns the project root directory
func getProjectRoot() (string, error) {
	// Get current executable path
	ex, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %w", err)
	}

	// Get directory of executable - the binary is at project root
	exPath := filepath.Dir(ex)

	projectRoot, err := filepath.Abs(exPath)
	if err != nil {
		return "", fmt.Errorf("failed to get absolute path: %w", err)
	}

	return projectRoot, nil
}

// loadEnvFile loads a .env file and returns a map of key-value pairs
func loadEnvFile(envPath string) (map[string]string, error) {
	envMap := make(map[string]string)

	// Read the .env file
	content, err := os.ReadFile(envPath)
	if err != nil {
		return nil, err
	}

	// Parse each line
	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Parse KEY=VALUE
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			envMap[key] = value
		}
	}

	return envMap, nil
}

// envToSlice converts a map to a slice of KEY=VALUE strings
func envToSlice(envMap map[string]string) []string {
	envSlice := make([]string, 0, len(envMap))
	for key, value := range envMap {
		envSlice = append(envSlice, fmt.Sprintf("%s=%s", key, value))
	}
	return envSlice
}

// buildAimeow builds the aimeow WhatsApp service binary
func buildAimeow(projectRoot string) (string, error) {
	// Skip build if flag is set (for Docker where binary is pre-built)
	if os.Getenv("SKIP_AIMEOW_BUILD") == "1" {
		fmt.Println("  Skipping aimeow build (SKIP_AIMEOW_BUILD=1)")
		aimeowDir := filepath.Join(projectRoot, "bins", "aimeow")
		// Try platform-specific binaries first
		platformBinary := "aimeow." + runtime.GOOS
		if runtime.GOOS == "windows" {
			platformBinary = "aimeow.exe"
		}
		// Check if platform binary exists
		if _, err := os.Stat(filepath.Join(aimeowDir, platformBinary)); err == nil {
			return filepath.Join(aimeowDir, platformBinary), nil
		}
		// Fall back to default binary name
		return filepath.Join(aimeowDir, "aimeow"), nil
	}

	aimeowDir := filepath.Join(projectRoot, "bins", "aimeow")

	// On Windows, Go automatically adds .exe extension, so we need to account for that
	binaryName := "aimeow"
	if runtime.GOOS == "windows" {
		binaryName = "aimeow.exe"
	}
	aimeowBinary := filepath.Join(aimeowDir, binaryName)

	// Check if binary exists and is newer than source
	binaryInfo, err := os.Stat(aimeowBinary)
	if err == nil {
		mainGoPath := filepath.Join(aimeowDir, "main.go")
		mainGoInfo, err := os.Stat(mainGoPath)
		if err == nil && binaryInfo.ModTime().After(mainGoInfo.ModTime()) {
			// Binary is up to date
			return aimeowBinary, nil
		}
	}

	// Build the binary (Go will add .exe on Windows automatically)
	// We use the base name without extension for the -o flag
	cmd := exec.Command("go", "build", "-ldflags=-s -w", "-o", binaryName, "main.go")
	cmd.Dir = aimeowDir
	// Set CGO_ENABLED=1 for Windows to ensure proper binary
	cmd.Env = append(os.Environ(), "CGO_ENABLED=1")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("aimeow build failed: %w\n%s", err, string(output))
	}

	return aimeowBinary, nil
}
