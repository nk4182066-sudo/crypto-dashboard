// Browser notification helpers — permission, service-worker registration and
// showing local notifications. Used by the signal watcher and the enable-alerts
// card. Educational only. Not financial advice.

/** Result of asking the user for permission. */
export type PermissionResult = "granted" | "denied" | "default" | "not-supported";

/** localStorage key that remembers the last permission answer. */
export const PERMISSION_KEY = "notification-permission";

/**
 * Ask the browser for notification permission. Stores the answer so the UI can
 * restore state on the next visit without prompting again.
 */
export async function requestPermission(): Promise<PermissionResult> {
  if (typeof window === "undefined" || !("Notification" in window)) return "not-supported";

  try {
    const permission = await Notification.requestPermission();
    try {
      localStorage.setItem(PERMISSION_KEY, permission);
    } catch {
      /* ignore quota / private-mode failures */
    }
    return permission;
  } catch {
    return "default";
  }
}

/** Current permission without prompting ("default" until the user decides). */
export function currentPermission(): PermissionResult {
  if (typeof window === "undefined" || !("Notification" in window)) return "not-supported";
  return Notification.permission as Exclude<PermissionResult, "not-supported">;
}

/** localStorage key for the user's own alerts on/off switch. */
export const ALERTS_ENABLED_KEY = "notifications-enabled";

/**
 * User's alerts switch — independent of browser permission so a "Disable"
 * survives reloads. Defaults to enabled until the user turns it off.
 */
export function alertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(ALERTS_ENABLED_KEY);
    // Never toggled → treat as enabled (permission still gates delivery).
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

/** Persist the alerts on/off switch ("true" / "false"). */
export function setAlertsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERTS_ENABLED_KEY, String(enabled));
  } catch {
    /* ignore quota / private-mode failures */
  }
}

/**
 * Register /sw.js and wait for it to be ready. Returns the registration so the
 * caller can show notifications through it (keeps the click handler working).
 */
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch (error) {
    console.error("SW registration failed:", error);
    return null;
  }
}

/**
 * Show a local notification. Prefers the service worker registration so the
 * notificationclick handler in sw.js runs (focus existing tab / open app);
 * falls back to the plain Notification constructor where SW is unavailable.
 */
export async function showNotification(title: string, body: string, url = "/signals"): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "signal",
    data: { url },
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
        return;
      }
    }
    // Fallback: no service worker registration available — fire the notification directly.
    new Notification(title, options);
  } catch {
    /* notification blocked or unavailable — fail quietly */
  }
}
