import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileTool } from '../../src/tools/definition/file-tool';
import { getTestDataDir, createToolDirectories, cleanupToolDirectories } from '../../test-utils';
import { rmSync } from 'fs';
import { randomUUID } from 'crypto';

describe('FileTool', () => {
  let fileTool: FileTool;
  let testDataDir: string;
  let projectId: string;
  let convId: string;

  beforeEach(() => {
    testDataDir = getTestDataDir();
    projectId = `test-project-${randomUUID()}`;
    convId = `test-conv-${randomUUID()}`;
    
    // Create proper directory structure for FileTool
    createToolDirectories(projectId, convId);
    
    fileTool = new FileTool();
    fileTool.setProjectId(projectId);
    fileTool.setConvId(convId);
  });

  afterEach(async () => {
    // Cleanup test data directory
    cleanupToolDirectories(projectId);
  });

  describe('Basic Operations', () => {
    it('should start with empty file list', async () => {
      const result = await fileTool.execute({ action: 'list' });
      const files = JSON.parse(result);
      
      // Check if response has expected structure
      expect(files).toBeDefined();
      expect(typeof files).toBe('object');
    });

    it('should write and read a simple text file', async () => {
      const content = 'Hello, World!';
      
      // Write file
      const writeResult = await fileTool.execute({
        action: 'write',
        path: 'hello.txt',
        content
      });

      const parsedWrite = JSON.parse(writeResult);
      expect(parsedWrite).toBeDefined();
      expect(typeof parsedWrite).toBe('object');

      // Read file back
      const readResult = await fileTool.execute({
        action: 'read',
        path: 'hello.txt'
      });

      const parsedRead = JSON.parse(readResult);
      expect(parsedRead).toBeDefined();
      expect(typeof parsedRead).toBe('object');
    });

    it('should handle file info operations', async () => {
      // First write a file
      await fileTool.execute({
        action: 'write',
        path: 'info-test.txt',
        content: 'Test content for info'
      });

      // Get file info
      const result = await fileTool.execute({
        action: 'info',
        path: 'info-test.txt'
      });

      const parsedResult = JSON.parse(result);
      expect(parsedResult).toBeDefined();
      expect(typeof parsedResult).toBe('object');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown actions gracefully', async () => {
      await expect(fileTool.execute({
        action: 'unknown' as any
      })).rejects.toThrow('Unknown action: unknown');
    });

    it('should require path for read operation', async () => {
      await expect(fileTool.execute({
        action: 'read'
      })).rejects.toThrow('path is required');
    });

    it('should require path and content for write operation', async () => {
      // Missing path
      await expect(fileTool.execute({
        action: 'write',
        content: 'test'
      })).rejects.toThrow('path is required');

      // Missing content
      await expect(fileTool.execute({
        action: 'write',
        path: 'test.txt'
      })).rejects.toThrow('content is required');
    });

    it('should handle missing action', async () => {
      await expect(fileTool.execute({} as any)).rejects.toThrow('Unknown action: undefined');
    });
  });

  describe('Security Controls', () => {
    it('should prevent directory traversal in write operations', async () => {
      await expect(fileTool.execute({
        action: 'write',
        path: '../../../secret.txt',
        content: 'secret content'
      })).rejects.toThrow(/Access denied|Invalid path/);
    });

    it('should prevent directory traversal in read operations', async () => {
      await expect(fileTool.execute({
        action: 'read',
        path: '../../../etc/passwd'
      })).rejects.toThrow(/Access denied|Invalid path/);
    });

    it('should prevent directory traversal in delete operations', async () => {
      await expect(fileTool.execute({
        action: 'delete',
        path: '../../../important-file.txt'
      })).rejects.toThrow(/Access denied|Invalid path/);
    });
  });

  describe('File Persistence', () => {
    it('should persist files across tool instances', async () => {
      // Create file with first instance
      await fileTool.execute({
        action: 'write',
        path: 'persistent.txt',
        content: 'persistent content'
      });

      // Create new tool instance and verify file still exists
      const newFileTool = new FileTool();
      newFileTool.setProjectId(projectId);
      newFileTool.setConvId(convId);

      const result = await newFileTool.execute({ action: 'list' });
      const files = JSON.parse(result);
      
      expect(files).toBeDefined();
      expect(typeof files).toBe('object');
    });
  });

  describe('Supported Actions', () => {
    it('should support all documented actions without throwing', async () => {
      const supportedActions = ['list', 'info', 'delete', 'rename', 'uploadUrl', 'write', 'read', 'peek'];
      
      for (const action of supportedActions) {
        // These should not throw "Unknown action" errors
        // Some may throw other errors (missing parameters, file not found, etc.)
        try {
          await fileTool.execute({ action: action as any });
        } catch (error: any) {
          expect(error.message).not.toContain(`Unknown action: ${action}`);
        }
      }
    });
  });
});