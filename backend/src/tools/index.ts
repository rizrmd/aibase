import { Tool } from "../llm/conversation";
import { FileTool } from "./definition/file-tool";
import { TodoTool } from "./definition/todo-tool";

/**
 * Get all built-in tools for a specific conversation
 */
export function getBuiltinTools(convId: string = "default", projectId: string = "default"): Tool[] {
  const fileTool = new FileTool();
  fileTool.setConvId(convId);
  fileTool.setProjectId(projectId);

  const todoTool = new TodoTool();
  todoTool.setConvId(convId);
  todoTool.setProjectId(projectId);

  return [
    fileTool,
    todoTool,
  ];
}
