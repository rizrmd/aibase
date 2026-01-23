package main

import (
	"fmt"
	"os"
	"os/exec"
	"sync"

	"github.com/fatih/color"
)

// Process represents a managed process
type Process struct {
	Name    string
	Dir     string
	Command string
	Args    []string
	Env     []string // Environment variables
	LogDir  string   // Directory for log files
	Cmd     *exec.Cmd
}

// Orchestrator manages multiple processes
type Orchestrator struct {
	projectRoot string
	bunPath     string
	processes   []*Process
	mu          sync.Mutex
}

// NewOrchestrator creates a new process orchestrator
func NewOrchestrator(projectRoot, bunPath string) *Orchestrator {
	return &Orchestrator{
		projectRoot: projectRoot,
		bunPath:     bunPath,
		processes:   make([]*Process, 0),
	}
}

// AddProcess adds a process to the orchestrator
func (o *Orchestrator) AddProcess(name, dir, command string, args []string, env []string, logDir string) {
	o.mu.Lock()
	defer o.mu.Unlock()

	o.processes = append(o.processes, &Process{
		Name:    name,
		Dir:     dir,
		Command: command,
		Args:    args,
		Env:     env,
		LogDir:  logDir,
	})
}

// Start starts all processes
func (o *Orchestrator) Start() error {
	o.mu.Lock()
	defer o.mu.Unlock()

	for _, proc := range o.processes {
		if err := o.startProcess(proc); err != nil {
			return fmt.Errorf("failed to start %s: %w", proc.Name, err)
		}
	}

	return nil
}

// startProcess starts a single process
func (o *Orchestrator) startProcess(proc *Process) error {
	cmd := exec.Command(proc.Command, proc.Args...)
	cmd.Dir = proc.Dir

	// Set environment variables
	if len(proc.Env) > 0 {
		cmd.Env = append(os.Environ(), proc.Env...)
	}

	// Create log directory if it doesn't exist
	if proc.LogDir != "" {
		if err := os.MkdirAll(proc.LogDir, 0755); err != nil {
			return fmt.Errorf("failed to create log directory: %w", err)
		}

		// Create log files
		stdoutLogPath := fmt.Sprintf("%s/%s.log", proc.LogDir, proc.Name)
		stderrLogPath := fmt.Sprintf("%s/%s-error.log", proc.LogDir, proc.Name)

		stdoutFile, err := os.OpenFile(stdoutLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return fmt.Errorf("failed to create stdout log file: %w", err)
		}

		stderrFile, err := os.OpenFile(stderrLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			stdoutFile.Close()
			return fmt.Errorf("failed to create stderr log file: %w", err)
		}

		// Redirect stdout and stderr to log files
		cmd.Stdout = stdoutFile
		cmd.Stderr = stderrFile

		// Close files when process exits
		go func() {
			if proc.Cmd != nil {
				proc.Cmd.Wait()
				stdoutFile.Close()
				stderrFile.Close()
			}
		}()
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		return err
	}

	proc.Cmd = cmd

	return nil
}

// Stop stops all processes gracefully
func (o *Orchestrator) Stop() error {
	o.mu.Lock()
	defer o.mu.Unlock()

	var errors []error

	// Stop all processes
	for _, proc := range o.processes {
		if proc.Cmd != nil && proc.Cmd.Process != nil {
			color.Yellow("  Stopping %s...\n", proc.Name)

			// Send SIGTERM for graceful shutdown
			if err := proc.Cmd.Process.Signal(os.Interrupt); err != nil {
				// If signal fails, try kill
				if killErr := proc.Cmd.Process.Kill(); killErr != nil {
					errors = append(errors, fmt.Errorf("failed to stop %s: %v", proc.Name, killErr))
					continue
				}
			}

			// Wait for process to exit
			proc.Cmd.Wait()

			color.Green("  ✓ Stopped %s\n", proc.Name)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("errors during shutdown: %v", errors)
	}

	return nil
}
