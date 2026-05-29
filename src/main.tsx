/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
import "./assets/styles/index.scss";
import "./utils/monaco";

import { ResizeObserver } from "@juggle/resize-observer";
import { ComposeContextProvider } from "foxact/compose-context-provider";
import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { MihomoWebSocket } from "tauri-plugin-mihomo-api";

import { BaseErrorBoundary } from "./components/base";
import { hideInitialOverlay } from "./pages/_layout/utils";
import { router } from "./pages/_routers";
import { AppDataProvider } from "./providers/app-data-provider";
import { AuthProvider } from "./providers/auth-provider";
import { WindowProvider } from "./providers/window";
import { FALLBACK_LANGUAGE, initializeLanguage } from "./services/i18n";
import {
  preloadAppData,
  resolveThemeMode,
  getPreloadConfig,
} from "./services/preload";
import {
  LoadingCacheProvider,
  ThemeModeProvider,
  UpdateStateProvider,
} from "./services/states";
import { disableWebViewShortcuts } from "./utils/disable-webview-shortcuts";
import {
  isIgnoredMonacoWorkerError,
  patchMonacoWorkerConsole,
} from "./utils/monaco-worker-ignore";

if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserver;
}

const mainElementId = "root";
const container = document.getElementById(mainElementId);

if (!container) {
  throw new Error(
    `No container '${mainElementId}' found to render application`,
  );
}

disableWebViewShortcuts();

const initializeApp = (initialThemeMode: "light" | "dark") => {
  const contexts = [
    <ThemeModeProvider key="theme" initialState={initialThemeMode} />,
    <LoadingCacheProvider key="loading" />,
    <UpdateStateProvider key="update" />,
  ];

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ComposeContextProvider contexts={contexts}>
        <BaseErrorBoundary>
          <WindowProvider>
            <AuthProvider>
              <AppDataProvider>
                <RouterProvider router={router} />
              </AppDataProvider>
            </AuthProvider>
          </WindowProvider>
        </BaseErrorBoundary>
      </ComposeContextProvider>
    </React.StrictMode>,
  );

  // 关键修复：初始 “Loading Clash Verge...” 的隐藏逻辑在 _layout 里，
  // 但未登录时不会渲染 Layout（只渲染 ProtectedRoute 转圈或跳登录），overlay 永远不会被隐藏。
  // 因此在应用首次渲染后立即隐藏 overlay，确保能进入登录页或主界面。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      hideInitialOverlay();
    });
  });
};

const BOOTSTRAP_TIMEOUT_MS = 8000;

const bootstrap = async () => {
  const { initialThemeMode } = await preloadAppData();
  initializeApp(initialThemeMode);
};

const bootstrapWithTimeout = () => {
  const timeoutId = window.setTimeout(() => {
    console.warn(
      "[main.tsx] Bootstrap timed out, rendering with fallback config",
    );
    initializeApp(resolveThemeMode(getPreloadConfig()));
  }, BOOTSTRAP_TIMEOUT_MS);

  bootstrap()
    .then(() => {
      window.clearTimeout(timeoutId);
    })
    .catch((error) => {
      window.clearTimeout(timeoutId);
      console.error(
        "[main.tsx] App bootstrap failed, falling back to default language:",
        error,
      );
      initializeLanguage(FALLBACK_LANGUAGE)
        .catch((fallbackError) => {
          console.error(
            "[main.tsx] Fallback language initialization failed:",
            fallbackError,
          );
        })
        .finally(() => {
          initializeApp(resolveThemeMode(getPreloadConfig()));
        });
    });
};

bootstrapWithTimeout();

patchMonacoWorkerConsole();

// Error handling
window.addEventListener("error", (event) => {
  if (isIgnoredMonacoWorkerError(event.error ?? event.message)) {
    event.preventDefault();
    return;
  }
  console.error("[main.tsx] Global error:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  if (isIgnoredMonacoWorkerError(event.reason)) {
    event.preventDefault();
    return;
  }
  console.error("[main.tsx] Unhandled promise rejection:", event.reason);
});

// Page close/refresh events
window.addEventListener("beforeunload", () => {
  // Clean up all WebSocket instances to prevent memory leaks
  MihomoWebSocket.cleanupAll();
});

// Page loaded event
window.addEventListener("DOMContentLoaded", () => {
  // Clean up all WebSocket instances to prevent memory leaks
  MihomoWebSocket.cleanupAll();
});
