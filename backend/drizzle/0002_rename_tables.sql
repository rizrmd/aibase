-- Rename tables to simpler hierarchical names
ALTER TABLE "conversations" RENAME TO "conversation";--> statement-breakpoint
ALTER TABLE "messages" RENAME TO "conversation_message";--> statement-breakpoint
ALTER TABLE "tool_executions" RENAME TO "conversation_tools";
