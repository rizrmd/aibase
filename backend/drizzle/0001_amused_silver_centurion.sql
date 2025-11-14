ALTER TABLE "conversation_tools" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tools" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "conversation_tools" CASCADE;--> statement-breakpoint
DROP TABLE "tools" CASCADE;--> statement-breakpoint
ALTER TABLE "tool_executions" DROP CONSTRAINT "tool_executions_tool_id_tools_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_executions" DROP COLUMN "tool_id";