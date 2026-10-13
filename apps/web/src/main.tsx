import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { selectedPlant } from "./api/client";
import { AppErrorBoundary, ConnectionStatus } from "./components/AppFeedback";
import { App } from "./App";
import { UserProvider } from "./state/UserContext";
import { initInstallPromptListener } from "./pwa/installPrompt";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import "./styles.css";

initInstallPromptListener();

function PlantScopedApp() {
  const location = useLocation();
  // Plant changes discard operational caches; directory navigation keeps the
  // authenticated app mounted and refreshes only the visible user directory.
  return <UserProvider key={selectedPlant()} managementView={location.pathname === "/users"}><App /></UserProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ConnectionStatus />
    <BrowserRouter>
      <PlantScopedApp />
    </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);

registerServiceWorker();
