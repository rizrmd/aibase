import { Tool } from "../llm/conversation";
import { FileTool } from "./definition/file-tool";

/**
 * Get all built-in tools
 */
export function getBuiltinTools(): Tool[] {
  return [
    new FileTool(),
    // Add more tools here as separate files
  ];
}
