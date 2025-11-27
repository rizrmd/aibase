"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientIdManager } from "@/lib/client-id";
import { useClientId } from "@/lib/client-id";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

/**
 * Example component demonstrating client ID usage patterns
 */
export function ClientIdExample() {
  const [serverResponse, setServerResponse] = useState<string>("");

  // Using the React hook (recommended for components)
  const {
    clientId: hookClientId,
    setClientId,
    generateNewClientId,
    hasClientId,
    metadata
  } = useClientId();

  // Using the static class directly (useful for utility functions)
  const directClientId = ClientIdManager.getClientId();

  const simulateApiCall = async () => {
    try {
      // Example of including client ID in API request
      const response = await fetch('/api/endpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': hookClientId, // Include client ID in headers
        },
        body: JSON.stringify({
          message: "Hello from client",
          clientId: hookClientId, // Include in request body
        }),
      });

      const data = await response.json();
      setServerResponse(`Server acknowledged client ID: ${data.clientId}`);
    } catch (error) {
      setServerResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const updateClientId = () => {
    const newId = `custom_${Date.now()}`;
    setClientId(newId);
    setServerResponse(`Updated client ID to: ${newId}`);
  };

  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Client ID Usage Examples
            <Badge variant="outline">React Hook</Badge>
          </CardTitle>
          <CardDescription>
            Demonstrating different ways to use client ID in components
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Hook-based usage */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold mb-2">Using React Hook:</h4>
            <p className="font-mono text-sm mb-2">Hook Client ID: {hookClientId}</p>
            <p className="font-mono text-sm mb-2">Has Stored ID: {hasClientId ? "Yes" : "No"}</p>
            <p className="font-mono text-sm">Browser Environment: {metadata.isBrowserEnvironment ? "Yes" : "No"}</p>
          </div>

          {/* Direct class usage */}
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-semibold mb-2">Using Static Class:</h4>
            <p className="font-mono text-sm mb-2">Direct Client ID: {directClientId}</p>
            <p className="font-mono text-sm">Has ID: {ClientIdManager.hasClientId() ? "Yes" : "No"}</p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={generateNewClientId} variant="outline">
              Generate New ID
            </Button>
            <Button onClick={updateClientId} variant="outline">
              Set Custom ID
            </Button>
            <Button onClick={simulateApiCall} variant="default">
              Simulate API Call
            </Button>
          </div>

          {/* Response display */}
          {serverResponse && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">Response:</h4>
              <p className="text-sm">{serverResponse}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integration Patterns</CardTitle>
          <CardDescription>
            Common integration patterns for client ID usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-muted rounded-md">
              <strong>API Requests:</strong> Include client ID in headers or request body
            </div>
            <div className="p-3 bg-muted rounded-md">
              <strong>WebSocket Connections:</strong> Client ID automatically included in URL and metadata
            </div>
            <div className="p-3 bg-muted rounded-md">
              <strong>Logging/Analytics:</strong> Use client ID to track user sessions
            </div>
            <div className="p-3 bg-muted rounded-md">
              <strong>Local Storage:</strong> Client IDs persist across browser sessions
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Utility function example showing how to use client ID outside React components
 */
export function exampleUtilityFunction() {
  // This function can be called from anywhere (including non-React code)
  const clientId = ClientIdManager.getClientId();

  console.log(`Processing request for client: ${clientId}`);

  // Example: Including client ID in error reporting
  const errorInfo = {
    error: "Something went wrong",
    clientId: clientId,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  };

  // Send error report with client ID
  // reportError(errorInfo);

  return errorInfo;
}