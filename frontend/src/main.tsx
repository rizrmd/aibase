import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { AppRouter } from "./components/app-router";

// Create WebSocket URL that points to the same domain with /api/ws path

const wsUrl = `ws://localhost:5040/api/ws`;

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AppRouter wsUrl={wsUrl} />
  </BrowserRouter>
);
