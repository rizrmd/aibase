import { Tool } from "../llm/conversation";
import { FileTool } from "./definition/file-tool";
import { TodoTool } from "./definition/todo-tool";
import { ScriptTool } from "./definition/script-tool";
import { MemoryTool } from "./definition/memory-tool";
import { ConfluenceTool } from "./definition/confluence-tool";
import { JiraTool } from "./definition/jira-tool";

/**
 * Get all built-in tools for a specific conversation
 */
export function getBuiltinTools(
  convId: string = "A1",
  projectId: string = "A1"
): Tool[] {
  const fileTool = new FileTool();
  fileTool.setConvId(convId);
  fileTool.setProjectId(projectId);

  const todoTool = new TodoTool();
  todoTool.setConvId(convId);
  todoTool.setProjectId(projectId);

  const scriptTool = new ScriptTool();
  scriptTool.setConvId(convId);
  scriptTool.setProjectId(projectId);

  const memoryTool = new MemoryTool();
  memoryTool.setProjectId(projectId);

  const confluenceTool = new ConfluenceTool();
  confluenceTool.setProjectId(projectId);

  const jiraTool = new JiraTool();
  jiraTool.setProjectId(projectId);

  return [fileTool, todoTool, scriptTool, memoryTool, confluenceTool, jiraTool];
}
