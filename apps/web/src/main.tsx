import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { UserProvider } from "./state/UserContext";
import { initInstallPromptListener } from "./pwa/installPrompt";
import { registerServiceWorker } from "./pwa/registerServiceWorker";
import "./styles.css";

initInstallPromptListener();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <UserProvider>
        <App />
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker();
