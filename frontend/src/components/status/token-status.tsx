import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";

interface TokenStatusProps {
  convId: string;
}

export function TokenStatus({ convId }: TokenStatusProps) {
  // Get token usage and maxTokens from store (comes directly from OpenAI API via backend)
  const tokenUsage = useChatStore((state) => state.tokenUsage);
  const maxTokens = useChatStore((state) => state.maxTokens) || 200000;

  const tokenStats = {
    totalTokens: tokenUsage?.totalTokens || 0,
    promptTokens: tokenUsage?.promptTokens || 0,
    completionTokens: tokenUsage?.completionTokens || 0,
    messageCount: tokenUsage?.messageCount || 0,
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
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
