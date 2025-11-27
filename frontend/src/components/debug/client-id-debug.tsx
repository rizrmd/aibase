"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClientId } from "@/lib/client-id";
import { MessagePersistence } from "@/lib/message-persistence";
import { WSConnectionManager } from "@/lib/ws/ws-connection-manager";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useState, useEffect } from "react";

export function ClientIdDebug() {
  const {
    clientId,
    setClientId,
    generateNewClientId,
    clearClientId,
    hasClientId,
    metadata
  } = useClientId();

  const [messageInfo, setMessageInfo] = useState(() => MessagePersistence.getStoredMessagesInfo());

  // WebSocket connection stats
  const [connectionStats, setConnectionStats] = useState(() => {
    const manager = WSConnectionManager.getInstance();
    return manager.getStats();
  });

  // Update connection stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const manager = WSConnectionManager.getInstance();
      setConnectionStats(manager.getStats());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(clientId);
  }, [clientId]);

  const clearStoredMessages = useCallback(() => {
    MessagePersistence.clearMessages();
    setMessageInfo(MessagePersistence.getStoredMessagesInfo());
  }, []);

  const refreshMessageInfo = useCallback(() => {
    setMessageInfo(MessagePersistence.getStoredMessagesInfo());
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return null; // Only show in development
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Client ID Debug
          <Badge variant={hasClientId ? "default" : "secondary"}>
            {hasClientId ? "Stored" : "Generated"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Client identification information for debugging
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Client ID:</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={copyToClipboard}
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="p-2 bg-muted rounded-md font-mono text-xs break-all">
            {clientId}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Metadata:</span>
          <div className="text-xs space-y-1 bg-muted p-2 rounded-md">
            <div>Has Stored ID: {metadata.hasStoredId ? "Yes" : "No"}</div>
            <div>Browser Environment: {metadata.isBrowserEnvironment ? "Yes" : "No"}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={generateNewClientId}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Generate New
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearClientId}
            className="flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Clear Storage
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Client IDs are automatically stored in localStorage and persist across browser sessions.
        </div>

        {/* Message Persistence Section */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">Message Persistence</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Stored Messages:</span>
              <Badge variant={messageInfo.hasMessages ? "default" : "secondary"}>
                {messageInfo.count}
              </Badge>
            </div>

            {messageInfo.hasMessages && (
              <div className="text-xs space-y-1 bg-muted p-2 rounded-md">
                <div>Storage Key: {messageInfo.storageKey}</div>
                <div>Last Message: {messageInfo.lastMessageTime ? new Date(messageInfo.lastMessageTime).toLocaleString() : 'N/A'}</div>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={refreshMessageInfo}
              className="flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
            {messageInfo.hasMessages && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearStoredMessages}
                className="flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Clear Messages
              </Button>
            )}
          </div>
        </div>

        {/* WebSocket Connection Section */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-2">WebSocket Connections</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Connections:</span>
              <Badge variant={connectionStats.totalConnections === 1 ? "default" : "destructive"}>
                {connectionStats.totalConnections}
              </Badge>
            </div>

            {connectionStats.totalConnections > 1 && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded-md">
                ⚠️ Multiple connections detected! This should not happen with the connection manager.
              </div>
            )}

            <div className="text-xs space-y-1 bg-muted p-2 rounded-md">
              <div>Expected: 1 connection</div>
              <div>Actual: {connectionStats.totalConnections} connections</div>
              <div>Status: {connectionStats.totalConnections === 1 ? "✅ Good" : "❌ Multiple connections"}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}