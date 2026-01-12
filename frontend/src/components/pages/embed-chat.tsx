/**
 * Public Embed Chat Page
 * Displays the chat interface for public embedding
 * No authentication required
 */

import { MainChat } from "./main-chat";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getEmbedInfo } from "@/lib/embed-api";
import { buildWsUrl } from "@/lib/base-path";
import { useEmbedConvId } from "@/lib/embed-conv-id";
import { useChatStore } from "@/stores/chat-store";

export function EmbedChatPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const embedToken = searchParams.get("embedToken");
  const uid = searchParams.get("uid") || undefined;

  const [embedInfo, setEmbedInfo] = useState<{
    customCss: string | null;
    welcomeMessage: string | null;
    useClientUid: boolean;
  }>({ customCss: null, welcomeMessage: null, useClientUid: false });
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  // Use embed-specific conversation ID management (URL hash based)
  const { convId, generateNewConvId, ensureHashUpdated } = useEmbedConvId();

  // Get messages from chat store to detect when first message is sent
  const messages = useChatStore((state) => state.messages);

  // Update URL hash with conversation ID after first message
  useEffect(() => {
    // Only update hash after the first user message is sent
    if (messages.length > 0) {
      ensureHashUpdated();
    }
  }, [messages.length, ensureHashUpdated]);

  // Validate embed parameters and fetch custom CSS
  useEffect(() => {
    const validate = async () => {
      if (!projectId || !embedToken) {
        setError("Invalid embed configuration: missing projectId or embedToken");
        setIsValidating(false);
        return;
      }

      try {
        // Validate embed token and get embed info (including custom CSS and welcome message)
        const info = await getEmbedInfo(projectId, embedToken);
        setEmbedInfo({
          customCss: info.customCss,
          welcomeMessage: info.welcomeMessage,
          useClientUid: info.useClientUid,
        });
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
    if (!embedInfo.customCss) return;

    try {
      // Basic sanitization: remove script tags and javascript: URLs
      const sanitizedCss = embedInfo.customCss
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
  }, [embedInfo.customCss]);

  // Build public WebSocket URL
  // Include uid parameter if present so backend can use it as CURRENT_UID
  const uidParam = uid ? `&uid=${encodeURIComponent(uid)}` : '';
  const wsUrl = typeof window !== 'undefined' && projectId && embedToken
    ? buildWsUrl(`/api/embed/ws?projectId=${encodeURIComponent(projectId)}&embedToken=${encodeURIComponent(embedToken)}${uidParam}`)
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

  // If uid is present AND enabled in config, derive convId from it to ensure persistence
  // Otherwise use the hash-based/generated convId
  const effectiveUid = embedInfo.useClientUid ? uid : undefined;
  const finalConvId = effectiveUid ? `embed_user_${effectiveUid}` : convId;

  return (
    <div className="h-screen w-screen embed-mode">
      <MainChat
        wsUrl={wsUrl}
        className="embed-chat"
        isTodoPanelVisible={false}
        isEmbedMode={true}
        welcomeMessage={embedInfo.welcomeMessage}
        embedConvId={finalConvId}
        embedGenerateNewConvId={generateNewConvId}
        uid={effectiveUid}
        embedToken={embedToken || undefined}
        projectId={projectId || undefined}
      />
    </div>
  );
}
