import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from parent directory (project root) where the main .env file is located
  const env = loadEnv(mode, path.resolve(process.cwd(), '..'), '');

  // Also check process.env (set by the Go build script) as fallback
  const basePath = env.PUBLIC_BASE_PATH || process.env.PUBLIC_BASE_PATH || "";
  const appName = env.APP_NAME || process.env.APP_NAME || "AI-BASE";

  // Normalize base path - ensure it starts with / and doesn't end with /
  const normalizedBasePath = basePath
    ? basePath.replace(/\/+$/, '').replace(/^([^/])/, '/$1')
    : "";

  // Use "/" as base when basePath is empty to ensure absolute paths for assets
  // This prevents asset loading issues when refreshing on deep routes like /projects/xxx/chat
  return {
    base: normalizedBasePath || "/",
    plugins: [
      react(),
      tailwindcss(),
      // Plugin to inject APP_NAME into index.html
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          return html.replace(
            /<title>(.*?)<\/title>/,
            `<title>${appName}</title>`
          );
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // Inject environment variables for import.meta.env usage in source code
    define: {
      'import.meta.env.PUBLIC_BASE_PATH': JSON.stringify(normalizedBasePath),
      'import.meta.env.APP_NAME': JSON.stringify(appName),
    },
    server: {
      port: 5050,
      proxy: {
        [`${normalizedBasePath}/api`]: {
          target: "http://localhost:5040",
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(normalizedBasePath, ''),
        },
      },
    },
  };
});
