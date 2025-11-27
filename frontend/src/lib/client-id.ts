/**
 * Client ID management utility
 * Provides consistent client ID storage and retrieval across the application
 */

import { useCallback, useEffect, useState } from 'react';

export class ClientIdManager {
  private static readonly CLIENT_ID_KEY = 'ws_client_id';
  private static readonly CLIENT_ID_PREFIX = 'client_';

  /**
   * Get the current client ID, generating one if it doesn't exist
   */
  static getClientId(): string {
    if (typeof window === 'undefined') {
      // Server-side environment - generate a temporary ID
      return `${this.CLIENT_ID_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    // Browser environment - check localStorage first
    let clientId = localStorage.getItem(this.CLIENT_ID_KEY);

    if (!clientId) {
      // Only generate a new ID if there isn't already one
      // This prevents race conditions with React Strict Mode
      clientId = this.generateClientId();
      // Double-check that another instance didn't already set one
      const existingId = localStorage.getItem(this.CLIENT_ID_KEY);
      if (!existingId) {
        this.setClientId(clientId);
      } else {
        // Use the existing ID that was set by another instance
        clientId = existingId;
      }
    }

    return clientId;
  }

  /**
   * Set the client ID (both in localStorage and update the WSClient if needed)
   */
  static setClientId(clientId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.CLIENT_ID_KEY, clientId);
    }
  }

  /**
   * Generate a new client ID
   */
  static generateClientId(): string {
    return `${this.CLIENT_ID_PREFIX}${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if a client ID exists
   */
  static hasClientId(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return !!localStorage.getItem(this.CLIENT_ID_KEY);
  }

  /**
   * Clear the stored client ID
   */
  static clearClientId(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.CLIENT_ID_KEY);
    }
  }

  /**
   * Get client ID metadata (useful for debugging/analytics)
   */
  static getClientMetadata(): {
    clientId: string;
    hasStoredId: boolean;
    isBrowserEnvironment: boolean;
  } {
    return {
      clientId: this.getClientId(),
      hasStoredId: this.hasClientId(),
      isBrowserEnvironment: typeof window !== 'undefined',
    };
  }
}

/**
 * React hook for easy access to client ID in components
 */
export function useClientId(): {
  clientId: string;
  setClientId: (clientId: string) => void;
  generateNewClientId: () => string;
  clearClientId: () => void;
  hasClientId: boolean;
  metadata: ReturnType<typeof ClientIdManager.getClientMetadata>;
} {
  const [clientId, setClientIdState] = useState(() => ClientIdManager.getClientId());
  const [hasClientId, setHasClientId] = useState(() => ClientIdManager.hasClientId());

  // Update state when localStorage changes (cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ClientIdManager['CLIENT_ID_KEY']) {
        const newClientId = ClientIdManager.getClientId();
        setClientIdState(newClientId);
        setHasClientId(ClientIdManager.hasClientId());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const setClientId = useCallback((newClientId: string) => {
    ClientIdManager.setClientId(newClientId);
    setClientIdState(newClientId);
    setHasClientId(true);
  }, []);

  const generateNewClientId = useCallback(() => {
    const newClientId = ClientIdManager.generateClientId();
    ClientIdManager.setClientId(newClientId);
    setClientIdState(newClientId);
    setHasClientId(true);
    return newClientId;
  }, []);

  const clearClientId = useCallback(() => {
    ClientIdManager.clearClientId();
    const newClientId = ClientIdManager.getClientId(); // Will generate a new one
    setClientIdState(newClientId);
    setHasClientId(false);
  }, []);

  return {
    clientId,
    setClientId,
    generateNewClientId,
    clearClientId,
    hasClientId,
    metadata: ClientIdManager.getClientMetadata(),
  };
}