/**
 * Public Embed Chat Page
 * Displays the chat interface for public embedding
 * No authentication required
 */

import { MainChat } from "./main-chat";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getEmbedInfo } from "@/lib/embed-api";

export function EmbedChatPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const embedToken = searchParams.get("embedToken");
  const customCss = searchParams.get("css");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  // Validate embed parameters
  useEffect(() => {
    const validate = async () => {
      if (!projectId || !embedToken) {
        setError("Invalid embed configuration: missing projectId or embedToken");
        setIsValidating(false);
        return;
      }

      try {
        // Validate embed token with backend
        await getEmbedInfo(projectId, embedToken);
        setIsValidating(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to validate embed configuration");
        setIsValidating(false);
      }
    };

    validate();
  }, [projectId, embedToken]);

  // Inject custom CSS
  useEffect(() => {
    if (!customCss) return;

    try {
      // Decode and sanitize CSS
      const decodedCss = decodeURIComponent(customCss);

      // Basic sanitization: remove script tags and javascript: URLs
      const sanitizedCss = decodedCss
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');

      // Limit CSS size to 10KB
      if (sanitizedCss.length > 10240) {
        console.warn('[Embed] Custom CSS exceeds 10KB limit, truncating');
        return;
      }

      const style = document.createElement("style");
      style.textContent = sanitizedCss;
      style.setAttribute("data-embed-custom-css", "true");
      document.head.appendChild(style);

      return () => {
        // Clean up on unmount
        const styles = document.querySelectorAll('[data-embed-custom-css="true"]');
        styles.forEach((s) => s.remove());
      };
    } catch (error) {
      console.error('[Embed] Failed to inject custom CSS:', error);
    }
  }, [customCss]);

  // Build public WebSocket URL
  const wsUrl = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/embed/ws?projectId=${encodeURIComponent(projectId || '')}&embedToken=${encodeURIComponent(embedToken || '')}`
    : '';

  if (isValidating) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="text-center max-w-md p-6">
          <div className="rounded-lg bg-red-50 p-4 mb-4">
            <h2 className="text-lg font-semibold text-red-900 mb-2">
              Embed Configuration Error
            </h2>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Please check your embed code and try again. If the problem persists, contact the website administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen embed-mode">
      <MainChat
        wsUrl={wsUrl}
        className="embed-chat"
        isTodoPanelVisible={false}
        isEmbedMode={true}
      />
    </div>
  );
}
