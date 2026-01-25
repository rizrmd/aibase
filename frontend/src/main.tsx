import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { AppRouter } from "./components/app-router";
import { getBasePath, buildWsUrl } from "./lib/base-path";
import { getAppName, getFaviconUrl } from "./lib/setup";

// Register extension inspectors (triggers registration on import)
import "./components/ui/chat/tools/inspectors";

// Set document title from setup config or environment variable
getAppName().then((appName) => {
  document.title = appName;
});

// Set favicon if configured
getFaviconUrl().then((faviconUrl) => {
  if (faviconUrl) {
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      document.getElementsByTagName("head")[0].appendChild(link);
    }
    link.type = "image/x-icon";
    link.rel = "shortcut icon";
    link.href = faviconUrl;
  }
});

// Get base path for React Router
const basePath = getBasePath();

// Create WebSocket URL dynamically with base path support
const wsUrl = buildWsUrl("/api/ws");

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={basePath}>
    <AppRouter wsUrl={wsUrl} />
  </BrowserRouter>
);

