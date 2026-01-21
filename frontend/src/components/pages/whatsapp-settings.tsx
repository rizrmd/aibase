/**
 * WhatsApp Settings Page
 * Full page for managing WhatsApp integration with device linking
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildApiUrl } from "@/lib/base-path";
import { useProjectStore } from "@/stores/project-store";
import { MessageCircle, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import QRCodeLib from "qrcode";
import { useCallback, useEffect, useState, useRef } from "react";
import { toast } from "sonner";

const API_BASE_URL = buildApiUrl("");

interface WhatsAppClient {
  id: string;
  phone?: string | null;
  connected: boolean;
  connectedAt?: string;
  qrCode?: string;
  deviceName?: string;
}

interface WhatsAppWSMessage {
  type: 'subscribed' | 'status' | 'qr_code' | 'connected' | 'disconnected' | 'error';
  projectId?: string;
  data?: {
    projectId: string;
    phone?: string;
    connected?: boolean;
    connectedAt?: string;
    qrCode?: string;
    deviceName?: string;
    error?: string;
  };
}

export function WhatsAppSettings() {
  const { currentProject } = useProjectStore();
  const [client, setClient] = useState<WhatsAppClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef<boolean>(false as boolean); // Track latest connection status from WebSocket
  const qrRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null); // Track QR code refresh interval

  // Format phone number for display
  const formatPhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return "Unknown Device";

    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Format: +62 823 5063 4214
    if (digits.startsWith('0')) {
      // Local format: 0823 → 0823 5063 4214
      return digits.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
    } else if (digits.startsWith('62')) {
      // Indonesia format: 62823 → +62 823 5063 4214
      return '+62 ' + digits.substring(2).replace(/(\d{3})(\d{4})(\d{4})/, '$1 $2 $3');
    } else {
      // International format
      return '+' + digits;
    }
  };

  // Load WhatsApp client for current project
  const loadClient = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/client?projectId=${currentProject.id}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          setClient(null);
          return;
        }
        throw new Error("Failed to load WhatsApp client");
      }

      const data = await response.json();
      setClient(data.client);

      // Only fetch QR code if:
      // 1. Client exists
      // 2. Client is not connected (from API response)
      // 3. WebSocket hasn't told us we're connected yet
      if (data.client && !data.client.connected && wsConnectedRef.current !== true) {
        fetchQRCode(data.client.id);
      } else if (data.client && data.client.connected) {
        // API says connected, update our WebSocket ref
        wsConnectedRef.current = true;
        setQrCodeImage(null);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load WhatsApp client";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject]);

  // Fetch QR code for device linking
  const fetchQRCode = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/qr?clientId=${clientId}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch QR code");
      }

      const data = await response.json();

      // Abort if device became connected while fetching
      if (wsConnectedRef.current) {
        setQrCodeImage(null);
        return;
      }

      if (!data.success || !data.qrCode) {
        setQrCodeImage(null);
        return;
      }

      // Abort if device became connected while processing
      if (wsConnectedRef.current) {
        setQrCodeImage(null);
        return;
      }

      // Generate QR code image from the text
      const qrDataUrl = await QRCodeLib.toDataURL(data.qrCode, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      // Final check before setting QR code
      if (!wsConnectedRef.current) {
        setQrCodeImage(qrDataUrl);
      }
    } catch (err) {
      console.error("Failed to fetch QR code:", err);
      setQrCodeImage(null);
    }
  }, []);

  // Create new WhatsApp client
  const createClient = useCallback(async () => {
    if (!currentProject) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp/client`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: currentProject.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create WhatsApp client");
      }

      const data = await response.json();
      setClient(data.client);
      toast.success("WhatsApp client created successfully");

      // Fetch QR code for new client
      if (data.client && !data.client.connected) {
        fetchQRCode(data.client.id);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create WhatsApp client";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  }, [currentProject, fetchQRCode]);

  // Delete WhatsApp client
  const deleteClient = useCallback(async () => {
    if (!currentProject || !client) return;

    console.log('[WhatsApp Settings] Deleting client:', client.id);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/whatsapp/client?clientId=${client.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete WhatsApp client");
      }

      console.log('[WhatsApp Settings] Delete successful, clearing state');

      // Reset all state
      setClient(null);
      setQrCodeImage(null);
      wsConnectedRef.current = false;

      toast.success("WhatsApp client deleted successfully");

      // Reload client after a short delay to verify deletion
      setTimeout(() => {
        console.log('[WhatsApp Settings] Reloading client to verify deletion');
        loadClient();
      }, 500);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete WhatsApp client";
      console.error('[WhatsApp Settings] Delete failed:', errorMessage);
      toast.error(errorMessage);
    }
  }, [currentProject, client, loadClient]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!currentProject) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsBasePath = buildApiUrl("").replace(/^https?:\/\//, '').replace(/^http?:\/\//, '');
    const wsUrl = `${wsProtocol}//${wsHost}${wsBasePath}/api/whatsapp/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WhatsApp WS] Connected');
      // Subscribe to this project's updates
      ws.send(JSON.stringify({
        type: 'subscribe',
        projectId: currentProject.id,
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const message: WhatsAppWSMessage = JSON.parse(event.data);
        console.log('[WhatsApp WS] Message:', message);

        switch (message.type) {
          case 'subscribed':
            console.log('[WhatsApp WS] Subscribed to project:', message.projectId);
            break;

          case 'status':
          case 'connected':
          case 'disconnected':
            if (message.data) {
              const isConnected = message.data.connected || false;

              // Track latest connection status from WebSocket
              wsConnectedRef.current = isConnected;

              setClient({
                id: message.data.projectId,
                phone: message.data.phone,
                connected: isConnected,
                connectedAt: message.data.connectedAt,
                deviceName: message.data.deviceName,
              });

              // Clear QR code if device is connected
              if (isConnected) {
                setQrCodeImage(null);
                setIsLoading(false);
              }

              // Show notification on status change
              if (message.type === 'connected') {
                toast.success('WhatsApp connected successfully!');
              } else if (message.type === 'disconnected') {
                toast.error('WhatsApp disconnected');
              }
            }
            break;

          case 'qr_code':
            if (message.data?.qrCode) {
              const qrDataUrl = await QRCodeLib.toDataURL(message.data.qrCode, {
                width: 256,
                margin: 2,
                color: {
                  dark: "#000000",
                  light: "#FFFFFF",
                },
              });
              setQrCodeImage(qrDataUrl);
            }
            break;

          case 'error':
            if (message.data?.error) {
              toast.error(message.data.error);
            }
            break;
        }
      } catch (err) {
        console.error('[WhatsApp WS] Error parsing message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[WhatsApp WS] Error:', error);
    };

    ws.onclose = () => {
      console.log('[WhatsApp WS] Disconnected');
    };

    return () => {
      // Unsubscribe before closing
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'unsubscribe',
          projectId: currentProject.id,
        }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [currentProject]);

  // Load client when project changes
  useEffect(() => {
    loadClient();
  }, [loadClient]);

  // Auto-refresh QR code every 20 seconds if client is waiting for connection
  useEffect(() => {
    // Clear any existing interval
    if (qrRefreshIntervalRef.current) {
      clearInterval(qrRefreshIntervalRef.current);
      qrRefreshIntervalRef.current = null;
    }

    // Only start refresh if client exists and not connected
    if (client && !client.connected && !wsConnectedRef.current) {
      console.log('[WhatsApp QR] Starting auto-refresh every 1 minute');

      const refreshQRCode = async () => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/whatsapp/qr?clientId=${client.id}`,
          );

          if (!response.ok) {
            throw new Error("Failed to refresh QR code");
          }

          const data = await response.json();

          // Abort if device became connected while fetching
          if (wsConnectedRef.current) {
            setQrCodeImage(null);
            return;
          }

          if (data.success && data.qrCode) {
            // Generate QR code image from the text
            const qrDataUrl = await QRCodeLib.toDataURL(data.qrCode, {
              width: 256,
              margin: 2,
              color: {
                dark: "#000000",
                light: "#FFFFFF",
              },
            });

            // Only update if still not connected
            if (!wsConnectedRef.current) {
              setQrCodeImage(qrDataUrl);
              console.log('[WhatsApp QR] QR code refreshed');
            }
          } else {
            // QR code not available yet
            setQrCodeImage(null);
          }
        } catch (err) {
          console.error('[WhatsApp QR] Error refreshing QR code:', err);
        }
      };

      // Initial fetch
      refreshQRCode();

      // Set interval to refresh every 1 minute
      qrRefreshIntervalRef.current = setInterval(() => {
        refreshQRCode();
      }, 60000); // 1 minute
    }

    // Cleanup function
    return () => {
      if (qrRefreshIntervalRef.current) {
        clearInterval(qrRefreshIntervalRef.current);
        qrRefreshIntervalRef.current = null;
        console.log('[WhatsApp QR] Stopped auto-refresh');
      }
    };
  }, [client, wsConnectedRef.current]); // Re-run when client or connection status changes

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Loading WhatsApp settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <MessageCircle className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">WhatsApp Integration</h1>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!client ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect WhatsApp Device</CardTitle>
              <CardDescription>
                Link a WhatsApp device to this project to enable AI
                conversations via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={createClient}
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating client...
                  </>
                ) : (
                  <>
                    <Smartphone className="mr-2 h-4 w-4" />
                    Link Device
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Connection Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Device Status</span>
                  {client.connected ? (
                    <span className="text-sm font-normal text-green-600 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-600" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-yellow-600 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-yellow-600" />
                      Waiting for connection
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {client.connected
                    ? `Connected since ${new Date(client.connectedAt || "").toLocaleString()}`
                    : "Scan the QR code below with WhatsApp to link your device"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {client.connected ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">WhatsApp Device</p>
                          <p className="text-sm text-muted-foreground">
                            {formatPhoneNumber(client.phone)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={deleteClient}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs text-blue-800">
                        <strong>Note:</strong> To fully disconnect, also remove this device from Linked Devices in WhatsApp on your phone.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {qrCodeImage ? (
                      <div className="flex flex-col items-center gap-4 p-6 border rounded-lg bg-white">
                        <img
                          src={qrCodeImage}
                          alt="WhatsApp QR Code"
                          className="w-64 h-64"
                        />
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Waiting for QR code to be scanned...
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-12 border rounded-lg">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p className="font-medium">How to link your device:</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap Menu or Settings and select Linked Devices</li>
                        <li>Tap on Link a Device</li>
                        <li>
                          Point your phone at this screen to scan the QR code
                        </li>
                      </ol>

                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Important:</p>
                        <ul className="text-xs text-yellow-700 space-y-1 ml-2">
                          <li>• If you previously connected a device, make sure to remove it from Linked Devices on your phone first</li>
                          <li>• This ensures a clean connection and prevents conflicts</li>
                        </ul>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={deleteClient}
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Information Card */}
            {client.connected && (
              <Card>
                <CardHeader>
                  <CardTitle>How it works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    When someone sends a message to your WhatsApp number, the AI
                    will automatically respond to them in this project's
                    context.
                  </p>
                  <p>
                    Each WhatsApp contact will get their own unique conversation
                    that persists across sessions.
                  </p>
                  <p>
                    The AI can receive and send text messages, images,
                    locations, and other media types.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
