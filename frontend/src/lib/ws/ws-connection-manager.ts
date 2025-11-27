/**
 * WebSocket Connection Manager
 * Ensures only one WebSocket connection per unique configuration exists
 * Handles React Strict Mode double mounting gracefully
 */

import { WSClient } from "./ws-client";
import type { WSClientOptions } from "../types/model";

interface ConnectionInfo {
  client: WSClient;
  refCount: number;
  options: WSClientOptions;
}

export class WSConnectionManager {
  private static instance: WSConnectionManager;
  private connections = new Map<string, ConnectionInfo>();

  private constructor() {}

  static getInstance(): WSConnectionManager {
    if (!WSConnectionManager.instance) {
      WSConnectionManager.instance = new WSConnectionManager();
    }
    return WSConnectionManager.instance;
  }

  /**
   * Get or create a WebSocket client for the given options
   * Reuses existing connections when possible
   */
  getClient(options: WSClientOptions): WSClient {
    const connectionKey = this.generateConnectionKey(options);

    let connectionInfo = this.connections.get(connectionKey);

    if (connectionInfo) {
      // Reuse existing connection
      connectionInfo.refCount++;
      console.log(`WSConnectionManager: Reusing existing connection ${connectionKey} (ref count: ${connectionInfo.refCount})`);
      return connectionInfo.client;
    }

    // Create new connection
    console.log(`WSConnectionManager: Creating new WebSocket connection for key: ${connectionKey}`);
    const client = new WSClient(options);

    connectionInfo = {
      client,
      refCount: 1,
      options: { ...options }
    };

    this.connections.set(connectionKey, connectionInfo);
    console.log(`WSConnectionManager: Total connections now: ${this.connections.size}`);

    // Set up cleanup when connection is closed
    client.on("disconnected", () => {
      this.onConnectionDisconnected(connectionKey);
    });

    return client;
  }

  /**
   * Release a connection (called when component unmounts)
   */
  releaseClient(options: WSClientOptions): void {
    const connectionKey = this.generateConnectionKey(options);
    const connectionInfo = this.connections.get(connectionKey);

    if (connectionInfo) {
      connectionInfo.refCount--;
      console.log(`WSConnectionManager: Released connection ${connectionKey} (ref count: ${connectionInfo.refCount})`);

      // Only disconnect if no more references
      if (connectionInfo.refCount <= 0) {
        console.log(`WSConnectionManager: No more references for ${connectionKey}, disconnecting`);
        connectionInfo.client.disconnect();
        this.connections.delete(connectionKey);
        console.log(`WSConnectionManager: Total connections now: ${this.connections.size}`);
      }
    } else {
      console.log(`WSConnectionManager: Attempted to release unknown connection: ${connectionKey}`);
    }
  }

  /**
   * Force disconnect all connections
   */
  disconnectAll(): void {
    console.log(`WSConnectionManager: Disconnecting all ${this.connections.size} connections`);
    for (const [key, connectionInfo] of this.connections) {
      connectionInfo.client.disconnect();
    }
    this.connections.clear();
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connections: Array<{
      key: string;
      refCount: number;
      url: string;
      isConnected: boolean;
    }>;
  } {
    const connections = Array.from(this.connections.entries()).map(([key, info]) => ({
      key,
      refCount: info.refCount,
      url: info.options.url,
      isConnected: info.client.isConnected()
    }));

    return {
      totalConnections: this.connections.size,
      connections
    };
  }

  private generateConnectionKey(options: WSClientOptions): string {
    // Create a unique key based on URL and key options
    const keyParts = [
      options.url,
      options.reconnectAttempts?.toString() || '5',
      options.reconnectDelay?.toString() || '1000',
      options.heartbeatInterval?.toString() || '30000',
      options.timeout?.toString() || '10000'
    ];

    return keyParts.join('|');
  }

  private onConnectionDisconnected(connectionKey: string): void {
    const connectionInfo = this.connections.get(connectionKey);
    if (connectionInfo && connectionInfo.refCount <= 0) {
      console.log(`WSConnectionManager: Connection ${connectionKey} disconnected and cleaned up`);
      this.connections.delete(connectionKey);
    }
  }
}

/**
 * React hook for using WebSocket connection manager
 */
import { useCallback, useEffect, useRef, useMemo } from "react";

export function useWSConnection(options: WSClientOptions) {
  const clientRef = useRef<WSClient | null>(null);
  const managerRef = useRef<WSConnectionManager>(WSConnectionManager.getInstance());

  // Memoize options to prevent unnecessary recreations
  const memoizedOptions = useMemo(() => options, [
    options.url,
    options.reconnectAttempts,
    options.reconnectDelay,
    options.heartbeatInterval,
    options.timeout,
    options.protocols
  ]);

  // Initialize and manage connection in useEffect
  useEffect(() => {
    console.log("useWSConnection: useEffect triggered for:", memoizedOptions.url);

    // Get or create client
    clientRef.current = managerRef.current.getClient(memoizedOptions);

    // Cleanup on unmount
    return () => {
      if (clientRef.current) {
        console.log("useWSConnection: Cleaning up connection");
        managerRef.current.releaseClient(memoizedOptions);
        clientRef.current = null;
      }
    };
  }, [memoizedOptions]);

  return clientRef.current;
}