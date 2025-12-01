import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { WSClient } from "@/lib/ws/ws-connection-manager";
import { Zap, Loader2 } from "lucide-react";

interface CompactionStatusData {
  shouldCompact: boolean;
  currentTokens: number;
  threshold: number;
  utilizationPercent: number;
}

interface CompactionStatusProps {
  wsClient: WSClient | null;
}

export function CompactionStatus({ wsClient }: CompactionStatusProps) {
  const [status, setStatus] = useState<CompactionStatusData | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  // Request status from server
  const requestStatus = () => {
    if (!wsClient) return;

    wsClient.sendControl({
      type: "get_compaction_status",
    });
  };

  // Request status on mount and periodically
  useEffect(() => {
    if (!wsClient) return;

    requestStatus();
    const interval = setInterval(requestStatus, 60000); // Every minute

    return () => clearInterval(interval);
  }, [wsClient]);

  // Listen for status responses
  useEffect(() => {
    if (!wsClient) return;

    const handleMessage = (message: any) => {
      if (
        message.type === "control_response" &&
        message.data.type === "get_compaction_status"
      ) {
        setStatus({
          shouldCompact: message.data.shouldCompact,
          currentTokens: message.data.currentTokens,
          threshold: message.data.threshold,
          utilizationPercent: message.data.utilizationPercent,
        });
        setLastUpdate(Date.now());
      } else if (
        message.type === "control_response" &&
        message.data.type === "compact_chat"
      ) {
        setIsCompacting(false);
        if (message.data.compacted) {
          // Refresh status after compaction
          setTimeout(requestStatus, 500);
        }
      } else if (message.type === "notification") {
        // Auto-compaction notification
        if (message.data.message?.includes("compacted")) {
          setTimeout(requestStatus, 500);
        }
      }
    };

    wsClient.on("message", handleMessage);

    return () => {
      wsClient.off("message", handleMessage);
    };
  }, [wsClient]);

  const handleCompact = () => {
    if (!wsClient || isCompacting) return;

    setIsCompacting(true);
    wsClient.sendControl({
      type: "compact_chat",
    });
  };

  if (!status) {
    return null;
  }

  const getColor = () => {
    if (status.utilizationPercent >= 90) return "bg-red-500";
    if (status.utilizationPercent >= 70) return "bg-orange-500";
    if (status.utilizationPercent >= 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getTextColor = () => {
    if (status.utilizationPercent >= 90) return "text-red-600 dark:text-red-400";
    if (status.utilizationPercent >= 70) return "text-orange-600 dark:text-orange-400";
    if (status.utilizationPercent >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-lg border border-border">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            Token Usage
          </span>
          <span className={`text-xs font-semibold ${getTextColor()}`}>
            {status.utilizationPercent.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getColor()}`}
            style={{ width: `${Math.min(status.utilizationPercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {status.currentTokens.toLocaleString()} / {status.threshold.toLocaleString()}
          </span>
        </div>
      </div>

      {status.shouldCompact && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleCompact}
          disabled={isCompacting}
          className="shrink-0"
        >
          {isCompacting ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Compacting...
            </>
          ) : (
            <>
              <Zap className="mr-1 h-3 w-3" />
              Compact
            </>
          )}
        </Button>
      )}
    </div>
  );
}
