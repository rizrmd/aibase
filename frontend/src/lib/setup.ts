/**
 * Setup configuration utilities
 */


interface SetupConfig {
  appName: string | null;
  hasLogo: boolean;
  hasFavicon: boolean;
  aimeowEnabled?: boolean;
}

let setupCache: SetupConfig | null = null;
let setupPromise: Promise<SetupConfig | null> | null = null;

/**
 * Fetch setup configuration from API
 */
export async function fetchSetupConfig(): Promise<SetupConfig | null> {
  // Return cached value if available
  if (setupCache) {
    return setupCache;
  }

  // Return existing promise if fetch is in progress
  if (setupPromise) {
    return setupPromise;
  }

  // Fetch setup config
  setupPromise = (async () => {
    try {
      const response = await fetch("/api/setup");
      const data = await response.json();

      if (data.success && data.setup) {
        setupCache = data.setup;
        return setupCache;
      }

      return null;
    } catch (error) {
      console.error("Error fetching setup config:", error);
      return null;
    }
  })();

  return setupPromise;
}

/**
 * Get app name from setup or fallback to env
 */
export async function getAppName(): Promise<string> {
  const setup = await fetchSetupConfig();

  if (setup?.appName) {
    return setup.appName;
  }

  // Fallback to environment variable
  return import.meta.env.APP_NAME || "AI-BASE";
}

/**
 * Get logo URL if available
 */
export async function getLogoUrl(): Promise<string | null> {
  const setup = await fetchSetupConfig();

  if (setup?.hasLogo) {
    return "/api/setup/logo";
  }

  return null;
}

/**
 * Get favicon URL if available
 */
export async function getFaviconUrl(): Promise<string | null> {
  const setup = await fetchSetupConfig();

  if (setup?.hasFavicon) {
    return "/api/setup/favicon";
  }

  return null;
}

/**
 * Check if WhatsApp features are enabled
 */
export async function isWhatsAppEnabled(): Promise<boolean> {
  const setup = await fetchSetupConfig();
  return !!setup?.aimeowEnabled;
}

/**
 * Clear setup cache (useful for testing or after updates)
 */
export function clearSetupCache(): void {
  setupCache = null;
  setupPromise = null;
}

