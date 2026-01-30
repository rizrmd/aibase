import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info, Copy, Check, FileJson, FileText } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useFileContextStore } from "@/stores/file-context-store";
import { useState } from "react";
import type { Message } from "@/components/ui/chat/messages/types";

interface TokenStatusProps {
  convId: string;
}

export function TokenStatus({ convId }: TokenStatusProps) {
  // Get token usage and maxTokens from store (comes directly from OpenAI API via backend)
  const tokenUsage = useChatStore((state) => state.tokenUsage);
  const maxTokens = useChatStore((state) => state.maxTokens) || 200000;
  const messages = useChatStore((state) => state.messages);
  const [copiedFormat, setCopiedFormat] = useState<"markdown" | "json" | null>(null);

  // Get file context count
  const getContextFileCount = useFileContextStore((state) => state.getContextFileCount);

  const tokenStats = {
    totalTokens: tokenUsage?.totalTokens || 0,
    promptTokens: tokenUsage?.promptTokens || 0,
    completionTokens: tokenUsage?.completionTokens || 0,
    messageCount: tokenUsage?.messageCount || 0,
  };

  // Format the transcript including tool usage
  const formatTranscript = (msgs: Message[]): string => {
    const lines: string[] = [];
    lines.push(`# Conversation Transcript`);
    lines.push(`Conversation ID: ${convId}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");

    for (const msg of msgs) {
      if (msg.isThinking) continue; // Skip thinking indicators

      const role = msg.role.toUpperCase();
      lines.push(`## ${role}`);
      if (msg.createdAt) {
        lines.push(`Time: ${msg.createdAt.toLocaleString()}`);
      }
      lines.push("");

      // Add file attachments
      if (msg.attachments && msg.attachments.length > 0) {
        lines.push(`### Attached Files (${msg.attachments.length}):`);
        lines.push("");
        for (const file of msg.attachments) {
          lines.push(`- **${file.name}** (${(file.size / 1024).toFixed(2)} KB)`);
          if (file.type) {
            lines.push(`  - Type: ${file.type}`);
          }
          lines.push(`  - URL: ${file.url}`);
          if (file.description) {
            lines.push(`  - Description: ${file.description}`);
          }
        }
        lines.push("");
      }

      if (msg.content) {
        lines.push(msg.content);
        lines.push("");
      }

      // Add tool invocations
      if (msg.toolInvocations && msg.toolInvocations.length > 0) {
        lines.push(`### Tool Calls (${msg.toolInvocations.length}):`);
        lines.push("");
        for (const tool of msg.toolInvocations) {
          lines.push(`**Tool:** ${tool.toolName}`);
          if (tool.args) {
            lines.push(`**Args:** ${JSON.stringify(tool.args, null, 2)}`);
          }
          if (tool.state === "result" && "result" in tool) {
            const result = tool.result;
            const preview = typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2);
            // Truncate long results
            const truncated = preview.length > 1000
              ? preview.substring(0, 1000) + "\n... (truncated)"
              : preview;
            lines.push(`**Result:** ${truncated}`);
          }
          if (tool.state === "error" && "error" in tool) {
            lines.push(`**Error:** ${tool.error}`);
          }
          if (tool.duration) {
            lines.push(`**Duration:** ${tool.duration.toFixed(2)}s`);
          }
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  };

  const handleCopyTranscript = async (format: "markdown" | "json") => {
    const content = format === "json"
      ? formatTranscriptAsJSON(messages)
      : formatTranscript(messages);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch (err) {
      console.error("Failed to copy transcript:", err);
    }
  };

  const formatTranscriptAsJSON = (msgs: Message[]): string => {
    const transcript = {
      conversationId: convId,
      generatedAt: new Date().toISOString(),
      messages: msgs.filter(m => !m.isThinking).map(msg => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt?.toISOString(),
        attachments: msg.attachments?.map(file => ({
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          url: file.url,
          uploadedAt: new Date(file.uploadedAt).toISOString(),
        })),
        toolInvocations: msg.toolInvocations?.map(tool => {
          const base = {
            toolName: tool.toolName,
            state: tool.state,
            timestamp: tool.timestamp,
            duration: tool.duration,
          };
          if ("result" in tool && tool.state === "result") {
            return { ...base, result: tool.result };
          }
          if ("error" in tool && tool.state === "error") {
            return { ...base, error: tool.error };
          }
          if (tool.args) {
            return { ...base, args: tool.args };
          }
          return base;
        }),
      })),
    };
    return JSON.stringify(transcript, null, 2);
  };

  const utilizationPercent = (tokenStats.totalTokens / maxTokens) * 100;

  const getIconColor = () => {
    if (utilizationPercent >= 90) return "text-red-500";
    if (utilizationPercent >= 75) return "text-orange-500";
    if (utilizationPercent >= 50) return "text-yellow-500";
    return "text-green-500";
  };

  const getPercentColor = () => {
    if (utilizationPercent >= 90) return "text-red-600 dark:text-red-400";
    if (utilizationPercent >= 75) return "text-orange-600 dark:text-orange-400";
    if (utilizationPercent >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const getProgressColor = () => {
    if (utilizationPercent >= 90) return "bg-red-500";
    if (utilizationPercent >= 75) return "bg-orange-500";
    if (utilizationPercent >= 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label="View token usage details"
        >
          <Info className={`h-4 w-4 ${getIconColor()}`} />
          <span className={`text-sm font-medium ${getPercentColor()}`}>
            {utilizationPercent.toFixed(1)}%
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          {/* Header */}
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">Token Usage</h4>
            <p className="text-xs text-muted-foreground">
              Current conversation statistics
            </p>
          </div>

          {/* Conversation ID */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Conversation ID
            </div>
            <div className="text-xs font-mono bg-muted px-2 py-1 rounded">
              {convId}
            </div>
          </div>

          {/* Token Statistics */}
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Usage</span>
                <span className={`text-sm font-semibold ${getPercentColor()}`}>
                  {utilizationPercent.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${getProgressColor()}`}
                  style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{tokenStats.totalTokens.toLocaleString()} tokens</span>
                <span>{maxTokens.toLocaleString()} max</span>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Prompt Tokens</span>
                <span className="font-medium">
                  {tokenStats.promptTokens.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Completion Tokens</span>
                <span className="font-medium">
                  {tokenStats.completionTokens.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Messages Tracked</span>
                <span className="font-medium">{tokenStats.messageCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Files in Context</span>
                <span className="font-medium">{getContextFileCount()}</span>
              </div>
            </div>
          </div>

          {/* Copy Transcript Buttons */}
          <div className="pt-2 border-t space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Copy transcript
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCopyTranscript("markdown")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {copiedFormat === "markdown" ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Markdown
                  </>
                )}
              </button>
              <button
                onClick={() => handleCopyTranscript("json")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                {copiedFormat === "json" ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <FileJson className="h-4 w-4" />
                    JSON
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
