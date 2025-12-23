/**
 * Embed API client functions
 * Handles embedding functionality for projects
 */

const API_BASE_URL = "/api";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface EmbedInfo {
  projectId: string;
  name: string;
  description: string | null;
  customCss: string | null;
}

interface EmbedTokenResponse {
  embedToken: string;
}

/**
 * Get embed info for a project (public endpoint)
 */
export async function getEmbedInfo(
  projectId: string,
  embedToken: string
): Promise<EmbedInfo> {
  const response = await fetch(
    `${API_BASE_URL}/embed/info?projectId=${encodeURIComponent(projectId)}&embedToken=${encodeURIComponent(embedToken)}`
  );

  const data: ApiResponse<EmbedInfo> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to get embed info");
  }

  return data.data!;
}

/**
 * Enable embedding for a project
 */
export async function enableEmbed(projectId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/embed/enable`, {
    method: "POST",
    credentials: "include",
  });

  const data: ApiResponse<EmbedTokenResponse> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to enable embedding");
  }

  return data.data!.embedToken;
}

/**
 * Disable embedding for a project
 */
export async function disableEmbed(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/embed/disable`, {
    method: "POST",
    credentials: "include",
  });

  const data: ApiResponse<{ message: string }> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to disable embedding");
  }
}

/**
 * Regenerate embed token for a project
 */
export async function regenerateEmbedToken(projectId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/embed/regenerate`, {
    method: "POST",
    credentials: "include",
  });

  const data: ApiResponse<EmbedTokenResponse> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to regenerate embed token");
  }

  return data.data!.embedToken;
}

/**
 * Update custom CSS for embedded chat
 */
export async function updateEmbedCss(projectId: string, customCss: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/embed/css`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ customCss }),
  });

  const data: ApiResponse<{ message: string }> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to update embed CSS");
  }
}

/**
 * Generate embed code (iframe)
 * Note: CSS is stored in project config, not in URL
 */
export function generateIframeCode(
  projectId: string,
  embedToken: string,
  width: string = "400px",
  height: string = "600px"
): string {
  const baseUrl = window.location.origin;
  const embedUrl = `${baseUrl}/embed?projectId=${encodeURIComponent(projectId)}&embedToken=${encodeURIComponent(embedToken)}`;

  return `<iframe
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="microphone"
  style="border: 1px solid #ccc; border-radius: 8px;"
></iframe>`;
}

/**
 * Generate embed code (JavaScript)
 * Note: CSS is stored in project config, not in URL
 */
export function generateJavaScriptCode(
  projectId: string,
  embedToken: string,
  width: string = "400px",
  height: string = "600px"
): string {
  const baseUrl = window.location.origin;
  const embedUrl = `${baseUrl}/embed?projectId=${encodeURIComponent(projectId)}&embedToken=${encodeURIComponent(embedToken)}`;

  return `<div id="aibase-chat"></div>
<script>
(function() {
  const iframe = document.createElement('iframe');
  iframe.src = '${embedUrl}';
  iframe.width = '${width}';
  iframe.height = '${height}';
  iframe.frameBorder = '0';
  iframe.allow = 'microphone';
  iframe.style.cssText = 'border: 1px solid #ccc; border-radius: 8px;';
  document.getElementById('aibase-chat').appendChild(iframe);
})();
</script>`;
}
