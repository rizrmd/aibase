import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from parent directory (project root) where the main .env file is located
  const env = loadEnv(mode, path.resolve(process.cwd(), ".."), "");

  // Also check process.env (set by the Go build script) as fallback
  const basePath = env.PUBLIC_BASE_PATH || process.env.PUBLIC_BASE_PATH || "";
  const appName = env.APP_NAME || process.env.APP_NAME || "AI-BASE";

  // Normalize base path - ensure it starts with / and doesn't end with /
  const normalizedBasePath = basePath
    ? basePath.replace(/\/+$/, "").replace(/^([^/])/, "/$1")
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
        name: "html-transform",
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
      "import.meta.env.PUBLIC_BASE_PATH": JSON.stringify(normalizedBasePath),
      "import.meta.env.APP_NAME": JSON.stringify(appName),
    },
    server: {
      port: 5050,
      proxy: {
        [`${normalizedBasePath}/api`]: {
          target: "http://localhost:5040", // 3678
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(normalizedBasePath, ""),
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes("node_modules")) {
              if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) {
                return "react-vendor";
              }
              if (id.includes("shiki") || id.includes("vscode-oniguruma") || id.includes("vscode-textmate")) {
                return "shiki-vendor";
              }
              if (id.includes("mermaid") || id.includes("khroma") || id.includes("stylis")) {
                return "mermaid-vendor";
              }
              if (id.includes("@codemirror") || id.includes("@uiw") || id.includes("@lezer")) {
                return "codemirror-vendor";
              }
              if (id.includes("echarts") || id.includes("zrender")) {
                return "charts-vendor";
              }
              if (id.includes("framer-motion")) {
                return "framer-motion-vendor";
              }
              if (id.includes("@radix-ui") || id.includes("lucide-react")) {
                return "ui-vendor";
              }
              if (id.includes("react-markdown") || id.includes("remark-gfm") || id.includes("micromark") || id.includes("mdast") || id.includes("unist")) {
                return "markdown-vendor";
              }
              if (id.includes("html2canvas") || id.includes("qrcode")) {
                return "utils-vendor";
              }
              return "vendor";
            }
          },
        },
      },
    },
  };
});
