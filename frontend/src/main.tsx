import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { AppRouter } from "./components/app-router";
import { getBasePath, buildWsUrl } from "./lib/base-path";

// Set document title from environment variable
document.title = import.meta.env.APP_NAME || "AI-BASE";

// Get base path for React Router
const basePath = getBasePath();

// Create WebSocket URL dynamically with base path support
const wsUrl = buildWsUrl("/api/ws");

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={basePath}>
    <AppRouter wsUrl={wsUrl} />
  </BrowserRouter>
);

