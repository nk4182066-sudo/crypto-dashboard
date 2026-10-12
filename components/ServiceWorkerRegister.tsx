"use client";

// Registers the service worker and starts the 90+ signal watcher once the app
// loads, but only when the user has already granted notification permission.
// Mounted in app/layout.tsx (which is a server component). Educational only.
import { useEffect } from "react";
import { registerSW } from "@/src/lib/notifications";
import { initWatcher } from "@/src/lib/signalWatcher";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Register the worker (safe even before permission — it just enables the
    // notification click handler and future push).
    void registerSW();

    // Only start polling for new setups if alerts are already enabled.
    if ("Notification" in window && Notification.permission === "granted") {
      initWatcher();
    }
  }, []);

  return null;
}
