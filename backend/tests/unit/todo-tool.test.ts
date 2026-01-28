import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TodoTool, type TodoItem, type TodoList } from '../../src/tools/definition/todo-tool';
import { getTestDataDir } from '../../test-setup';
import { rmSync } from 'fs';
import { randomUUID } from 'crypto';

describe('TodoTool', () => {
  let todoTool: TodoTool;
  let testDataDir: string;
  let projectId: string;
  let convId: string;

  beforeEach(() => {
    testDataDir = getTestDataDir();
    projectId = `test-project-${randomUUID()}`;
    convId = `test-conv-${randomUUID()}`;
    todoTool = new TodoTool();
    todoTool.setProjectId(projectId);
    todoTool.setConvId(convId);
  });

  afterEach(async () => {
    // Cleanup test data directory
    const convDir = `${testDataDir}/data/${projectId}/${convId}`;
    try {
      rmSync(convDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
  });

  describe('Todo List Operations', () => {
    it('should start with empty todo list', async () => {
      const result = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(result) as TodoList;
      
      expect(todos.items).toHaveLength(0);
      expect(todos.items).toEqual([]);
      expect(todos.updatedAt).toBeDefined();
    });

    it('should add a single todo', async () => {
      const todoText = 'Test todo item';
      const addResult = await todoTool.execute({
        action: 'add',
        text: todoText
      });

      const parsedAdd = JSON.parse(addResult);
      expect(parsedAdd.summary.total).toBe(1);
      expect(parsedAdd.summary.completed).toBe(0);
      expect(parsedAdd.summary.pending).toBe(1);
      expect(parsedAdd.items).toHaveLength(1);
      expect(parsedAdd.items[0]!.text).toBe(todoText);
      expect(parsedAdd.items[0]!.checked).toBe(false);
      expect(parsedAdd.items[0]!.id).toBeDefined();

      // Verify in list
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      expect(todos.items).toHaveLength(1);
      expect(todos.items[0]!.text).toBe(todoText);
    });

    it('should add multiple todos at once', async () => {
      const todoTexts = ['First todo', 'Second todo', 'Third todo'];
      const addResult = await todoTool.execute({
        action: 'add',
        texts: todoTexts
      });

      const parsedAdd = JSON.parse(addResult);
      expect(parsedAdd.summary.total).toBe(3);
      expect(parsedAdd.summary.completed).toBe(0);
      expect(parsedAdd.summary.pending).toBe(3);
      expect(parsedAdd.items).toHaveLength(3);
      
      for (let i = 0; i < todoTexts.length; i++) {
        expect(parsedAdd.items[i]!.text).toBe(todoTexts[i]);
        expect(parsedAdd.items[i]!.checked).toBe(false);
      }

      // Verify in list
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult);
      expect(todos.items).toHaveLength(3);
      
      expect(todos.items[0]!.text).toBe('First todo');
      expect(todos.items[1]!.text).toBe('Second todo');
      expect(todos.items[2]!.text).toBe('Third todo');
    });
  });

  describe('Todo Status Operations', () => {
    beforeEach(async () => {
      // Setup initial todos
      await todoTool.execute({
        action: 'add',
        texts: ['Todo 1', 'Todo 2', 'Todo 3', 'Todo 4']
      });
    });

    it('should check off single todo', async () => {
      // Get todo IDs
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      const todoId = todos.items[0]!.id;

      // Check off todo
      const checkResult = await todoTool.execute({
        action: 'check',
        ids: [todoId]
      });

      const parsedCheck = JSON.parse(checkResult);
      expect(parsedCheck.result.checkedCount).toBe(1);
      expect(parsedCheck.result.notFound).toBeUndefined();

      // Verify status
      const updatedListResult = await todoTool.execute({ action: 'list' });
      const updatedTodos = JSON.parse(updatedListResult);
      expect(updatedTodos.items[0]!.checked).toBe(true);
      expect(updatedTodos.items[1]!.checked).toBe(false);
      expect(updatedTodos.items[2]!.checked).toBe(false);
      expect(updatedTodos.items[3]!.checked).toBe(false);
    });

    it('should check off multiple todos', async () => {
      // Get todo IDs
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      const todoIds = [todos.items[0]!.id, todos.items[2]!.id];

      // Check off todos
      const checkResult = await todoTool.execute({
        action: 'check',
        ids: todoIds
      });

      const parsedCheck = JSON.parse(checkResult);
      expect(parsedCheck.result.checkedCount).toBe(2);
      expect(parsedCheck.result.notFound).toBeUndefined();

      // Verify status
      const updatedListResult = await todoTool.execute({ action: 'list' });
      const updatedTodos = JSON.parse(updatedListResult);
      expect(updatedTodos.items[0]!.checked).toBe(true);
      expect(updatedTodos.items[1]!.checked).toBe(false);
      expect(updatedTodos.items[2]!.checked).toBe(true);
      expect(updatedTodos.items[3]!.checked).toBe(false);
    });

    it('should uncheck todos', async () => {
      // Check off some todos first
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      const todoIds = [todos.items[0]!.id, todos.items[1]!.id];

      await todoTool.execute({ action: 'check', ids: todoIds });

      // Now uncheck them
      const uncheckResult = await todoTool.execute({
        action: 'uncheck',
        ids: [todos.items[0]!.id]
      });

      const parsedUncheck = JSON.parse(uncheckResult);
      expect(parsedUncheck.result.uncheckedCount).toBe(1);
      expect(parsedUncheck.result.notFound).toBeUndefined();

      // Verify status
      const finalListResult = await todoTool.execute({ action: 'list' });
      const finalTodos = JSON.parse(finalListResult);
      expect(finalTodos.items[0]!.checked).toBe(false); // Unchecked
      expect(finalTodos.items[1]!.checked).toBe(true);  // Still checked
      expect(finalTodos.items[2]!.checked).toBe(false);
      expect(finalTodos.items[3]!.checked).toBe(false);
    });
  });

  describe('Todo Removal Operations', () => {
    beforeEach(async () => {
      // Setup initial todos
      await todoTool.execute({
        action: 'add',
        texts: ['Todo 1', 'Todo 2', 'Todo 3']
      });
    });

    it('should remove specific todos', async () => {
      // Get todo IDs
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      const todoId = todos.items[1]!.id; // Remove middle todo

      // Remove todo
      const removeResult = await todoTool.execute({
        action: 'remove',
        ids: [todoId]
      });

      const parsedRemove = JSON.parse(removeResult);
      expect(parsedRemove.result.removedCount).toBe(1);
      expect(parsedRemove.result.notFound).toBeUndefined();

      // Verify remaining todos
      const updatedListResult = await todoTool.execute({ action: 'list' });
      const updatedTodos = JSON.parse(updatedListResult);
      expect(updatedTodos.items).toHaveLength(2);
      expect(updatedTodos.items[0]!.text).toBe('Todo 1');
      expect(updatedTodos.items[1]!.text).toBe('Todo 3');
    });

    it('should remove multiple todos', async () => {
      // Get todo IDs
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      const todoIds = [todos.items[0]!.id, todos.items[2]!.id]; // Remove first and last

      // Remove todos
      const removeResult = await todoTool.execute({
        action: 'remove',
        ids: todoIds
      });

      const parsedRemove = JSON.parse(removeResult);
      expect(parsedRemove.result.removedCount).toBe(2);
      expect(parsedRemove.result.notFound).toBeUndefined();

      // Verify remaining todo
      const updatedListResult = await todoTool.execute({ action: 'list' });
      const updatedTodos = JSON.parse(updatedListResult);
      expect(updatedTodos.items).toHaveLength(1);
      expect(updatedTodos.items[0]!.text).toBe('Todo 2');
    });

    it('should clear all todos', async () => {
      const clearResult = await todoTool.execute({ action: 'clear' });
      
      const parsedClear = JSON.parse(clearResult);
      expect(parsedClear.summary.total).toBe(0);
      expect(parsedClear.items).toHaveLength(0);

      // Verify empty list
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult);
      expect(todos.items).toHaveLength(0);
    });
  });

  describe('Todo Finish Operation', () => {
    beforeEach(async () => {
      // Setup mixed todos
      await todoTool.execute({
        action: 'add',
        texts: ['Completed task 1', 'Incomplete task 1', 'Completed task 2', 'Incomplete task 2']
      });

      // Check off some todos
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      await todoTool.execute({
        action: 'check',
        ids: [todos.items[0]!.id, todos.items[2]!.id] // Check off task 1 and 3
      });
    });

    it('should finish completed todos with summary', async () => {
      const summary = 'Phase 1 completed successfully';
      const finishResult = await todoTool.execute({
        action: 'finish',
        summary
      });

      const parsedFinish = JSON.parse(finishResult);
      expect(parsedFinish.finishResult.removedCount).toBe(2);
      expect(parsedFinish.finishResult.summary).toBe(summary);
      expect(parsedFinish.finishResult.message).toContain('Removed 2 completed');

      // Verify incomplete todos remain
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult);
      expect(todos.items).toHaveLength(2);
      expect(todos.items[0]!.text).toBe('Incomplete task 1');
      expect(todos.items[1]!.text).toBe('Incomplete task 2');
      expect(todos.items[0]!.checked).toBe(false);
      expect(todos.items[1]!.checked).toBe(false);
    });

    it('should handle finish when no completed todos', async () => {
      // Uncheck all todos
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      await todoTool.execute({
        action: 'uncheck',
        ids: todos.items.map(item => item.id)
      });

      // Try to finish
      const finishResult = await todoTool.execute({
        action: 'finish',
        summary: 'No completed tasks'
      });

      const parsedFinish = JSON.parse(finishResult);
      expect(parsedFinish.finishResult.removedCount).toBe(0);
      expect(parsedFinish.finishResult.summary).toBe('No completed tasks');
      expect(parsedFinish.finishResult.message).toContain('Removed 0 completed');

      // All todos should remain
      const finalListResult = await todoTool.execute({ action: 'list' });
      const finalTodos = JSON.parse(finalListResult);
      expect(finalTodos.items).toHaveLength(4);
    });
  });

  describe('Todo Persistence', () => {
    it('should persist todos across tool instances', async () => {
      // Add todo with first instance
      await todoTool.execute({
        action: 'add',
        text: 'Persistent todo'
      });

      // Create new instance with same IDs
      const newTodoTool = new TodoTool();
      newTodoTool.setProjectId(projectId);
      newTodoTool.setConvId(convId);

      // Verify todo exists
      const listResult = await newTodoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult);
      expect(todos.items).toHaveLength(1);
      expect(todos.items[0]!.text).toBe('Persistent todo');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters', async () => {
      // Add without text or texts
      await expect(todoTool.execute({
        action: 'add'
      })).rejects.toThrow('text or texts is required for add action');

      // Check without ids
      await expect(todoTool.execute({
        action: 'check'
      })).rejects.toThrow('ids is required for check action');

      // Remove without ids
      await expect(todoTool.execute({
        action: 'remove'
      })).rejects.toThrow('ids is required for remove action');

      // Finish without summary
      await expect(todoTool.execute({
        action: 'finish'
      })).rejects.toThrow('summary is required for finish action');
    });

    it('should handle non-existent todo IDs', async () => {
      const nonExistentId = 'non-existent-id';

      const checkResult = await todoTool.execute({
        action: 'check',
        ids: [nonExistentId]
      });
      const parsedCheck = JSON.parse(checkResult);
      expect(parsedCheck.result.checkedCount).toBe(0);
      expect(parsedCheck.result.notFound).toEqual([nonExistentId]);

      const uncheckResult = await todoTool.execute({
        action: 'uncheck',
        ids: [nonExistentId]
      });
      const parsedUncheck = JSON.parse(uncheckResult);
      expect(parsedUncheck.result.uncheckedCount).toBe(0);
      expect(parsedUncheck.result.notFound).toEqual([nonExistentId]);

      const removeResult = await todoTool.execute({
        action: 'remove',
        ids: [nonExistentId]
      });
      const parsedRemove = JSON.parse(removeResult);
      expect(parsedRemove.result.removedCount).toBe(0);
      expect(parsedRemove.result.notFound).toEqual([nonExistentId]);
    });

    it('should handle unknown action', async () => {
      await expect(todoTool.execute({
        action: 'unknown' as any
      })).rejects.toThrow('Unknown action: unknown');
    });

    it('should handle empty arrays', async () => {
      await expect(todoTool.execute({
        action: 'add',
        texts: []
      })).rejects.toThrow('text or texts is required for add action');

      await expect(todoTool.execute({
        action: 'check',
        ids: []
      })).rejects.toThrow('ids is required for check action');
    });
  });

  describe('Broadcast Callback', () => {
    it('should call broadcast callback on changes', async () => {
      const broadcastCalls: any[] = [];

      todoTool.setBroadcastCallback((convId: string, todos: TodoList) => {
        broadcastCalls.push({ convId, todos });
      });

      // Add todo
      await todoTool.execute({
        action: 'add',
        text: 'Broadcast test'
      });

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].convId).toBe(convId);
      expect(broadcastCalls[0].todos.items).toHaveLength(1);
      expect(broadcastCalls[0].todos.items[0]!.text).toBe('Broadcast test');

      // Check todo
      const listResult = await todoTool.execute({ action: 'list' });
      const todos = JSON.parse(listResult) as TodoList;
      const todoId = todos.items[0]!.id;

      await todoTool.execute({
        action: 'check',
        ids: [todoId]
      });

      expect(broadcastCalls).toHaveLength(2);
      expect(broadcastCalls[1].todos.items[0]!.checked).toBe(true);
    });
  });
});