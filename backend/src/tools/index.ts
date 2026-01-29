import { Tool } from "../llm/conversation";
import { TodoTool } from "./definition/todo-tool";
import { ScriptTool } from "./definition/script-tool";
import { MemoryTool } from "./definition/memory-tool";

/**
 * Get all built-in tools for a specific conversation
 */
export function getBuiltinTools(
  convId: string = "A1",
  projectId: string = "A1",
  tenantId: number | string = "default",
  userId?: string
): Tool[] {
  const todoTool = new TodoTool();
  todoTool.setConvId(convId);
  todoTool.setProjectId(projectId);
  todoTool.setTenantId(tenantId);

  const scriptTool = new ScriptTool();
  scriptTool.setConvId(convId);
  scriptTool.setProjectId(projectId);
  scriptTool.setUserId(userId || "");

  const memoryTool = new MemoryTool();
  memoryTool.setProjectId(projectId);

  return [todoTool, scriptTool, memoryTool];
}
