"use client";

// Enable-alerts card — permission + on/off toggle for the 15-min signal watcher.
// 3 states: default ("Enable Notifications" button → requestPermission), granted
// ("✅ Enabled" green + Disable), denied ("❌ Blocked" + Open Settings button that
// reveals the step-by-step guide — pages cannot open chrome:// links themselves —
// + Reload). A "denied" permission cannot be re-requested from JS, so the guide
// walks the user to browser settings. The user's switch is stored in localStorage
// key "notifications-enabled". Educational only.
import { useCallback, useEffect, useState } from "react";
import {
  alertsEnabled,
  currentPermission,
  registerSW,
  requestPermission,
  setAlertsEnabled,
  type PermissionResult,
} from "@/src/lib/notifications";
import { initWatcher, stopWatcher, ALERT_MIN_SCORE } from "@/src/lib/signalWatcher";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const GREEN = "#00C087";
const RED = "#F6465D";
const BLUE = "#3B82F6";

/** Instructions are shown in-page: browsers refuse to open chrome:// links
 *  from a normal page, so a dead anchor would help nobody. */

export default function EnableNotifications() {
  // Drives the 3 UI states: "default" | "granted" | "denied" | "not-supported".
  const [status, setStatus] = useState<PermissionResult>("default");
  const [busy, setBusy] = useState(false);
  // Denied state — toggle for the "Open Settings" step-by-step guide.
  const [showSteps, setShowSteps] = useState(false);

  // Restore state on mount (no prompt): reflect the real permission and, when
  // already granted, whether the user's own switch is on.
  useEffect(() => {
    const permission = currentPermission();
    if (permission === "granted") {
      // Granted but switched off → show the default "Enable" state so a reload
      // stays consistent with the saved switch.
      setStatus(alertsEnabled() ? "granted" : "default");
    } else {
      setStatus(permission);
    }
  }, []);

  // Keep the watcher in sync: run only while permission is granted and on.
  useEffect(() => {
    if (status === "granted" && alertsEnabled()) initWatcher();
    else stopWatcher();
  }, [status]);

  // default → prompt the browser. When the browser already returned "denied",
  // requestPermission() will NOT re-prompt (JS cannot force it), so status stays
  // "denied" and the Open Settings guide takes over.
  const handleEnable = useCallback(async () => {
    setBusy(true);
    const result = await requestPermission();
    setStatus(result);
    if (result === "granted") {
      setAlertsEnabled(true);
      await registerSW();
      initWatcher();
    }
    setBusy(false);
  }, []);

  // Turn alerts off: clear the switch and return to the default (Enable) state.
  // Permission stays "granted", so re-enabling resolves instantly without a new
  // prompt.
  const handleDisable = useCallback(() => {
    setAlertsEnabled(false);
    stopWatcher();
    setStatus("default");
  }, []);

  return (
    <div className="rounded-2xl border p-4" style={{ backgroundColor: CARD, borderColor: BORDER }}>
      <p className="text-sm font-bold" style={{ color: TEXT }}>🔔 ALERTS</p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: MUTED }}>
        {ALERT_MIN_SCORE}+ score wale signals ka alert seedha notification pe paayen.
        <br />
        Get {ALERT_MIN_SCORE}+ score setup alerts straight to your notifications.
      </p>

      {status === "not-supported" ? (
        <p className="mt-3 text-xs" style={{ color: MUTED }}>
          Is browser mein notifications support nahi hain.
        </p>
      ) : (
        <>
          {/* State 2 — granted: ✅ Enabled. */}
          {status === "granted" ? (
            <div
              className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: "rgba(0,192,135,0.12)" }}
            >
              <span className="text-sm" style={{ color: GREEN }}>✅</span>
              <span className="text-xs font-semibold" style={{ color: GREEN }}>Enabled</span>
            </div>
          ) : null}

          {/* State 3 — denied/blocked: ❌ Blocked. */}
          {status === "denied" ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(246,70,93,0.12)" }}>
              <span className="text-sm" style={{ color: RED }}>❌</span>
              <span className="text-xs font-semibold" style={{ color: RED }}>Blocked</span>
            </div>
          ) : null}

          {/* Action area — depends on the state. */}
          {status === "default" ? (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold transition-opacity disabled:opacity-60"
              style={{ backgroundColor: GREEN, color: "#0B0E11" }}
            >
              {busy ? "…" : "🔔 Enable Notifications"}
            </button>
          ) : status === "granted" ? (
            <button
              type="button"
              onClick={handleDisable}
              className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold transition-opacity"
              style={{ backgroundColor: RED, color: "#FFFFFF" }}
            >
              🔕 Disable
            </button>
          ) : status === "denied" ? (
            <div className="mt-2 space-y-2">
              {/* Clear blocked status (spec). */}
              <p className="text-[11px] font-semibold leading-relaxed" style={{ color: RED }}>
                Browser mein notifications blocked hain.
              </p>
              {/* Pages cannot open chrome:// links — the button reveals the
                  step-by-step guide instead (spec: Open Settings → instructions). */}
              <button
                type="button"
                onClick={() => setShowSteps((value) => !value)}
                className="block w-full rounded-lg py-2.5 text-center text-sm font-bold"
                style={{ backgroundColor: BLUE, color: "#FFFFFF" }}
              >
                {showSteps ? "⚙️ Hide Settings Steps" : "⚙️ Open Settings"}
              </button>
              {showSteps ? (
                <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(59,130,246,0.10)" }}>
                  <p className="text-[11px] font-semibold leading-relaxed" style={{ color: TEXT }}>
                    Chrome Settings → Privacy → Site Settings → Notifications
                  </p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed" style={{ color: MUTED }}>
                    <li>Chrome mein ⋮ → Settings kholo</li>
                    <li>Privacy and security → Site Settings</li>
                    <li>Notifications → Blocked sites list</li>
                    <li>
                      Is site ko <span className="font-bold" style={{ color: GREEN }}>Allow</span> karo
                    </li>
                    <li>Wapas is page pe aayein → 🔄 Reload</li>
                  </ol>
                  <p className="mt-1 text-[10px] leading-relaxed" style={{ color: MUTED }}>
                    Note: browser khud chrome:// links page se open nahi hone deta — is liye steps diye gaye hain.
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full rounded-lg border py-2.5 text-sm font-bold transition-colors hover:bg-white/5"
                style={{ borderColor: BORDER, color: TEXT }}
              >
                🔄 Reload
              </button>
            </div>
          ) : null}
        </>
      )}

      <p className="mt-2 text-[10px]" style={{ color: MUTED }}>
        Status: /signals · {ALERT_MIN_SCORE}+ only · Educational analysis, not financial advice.
      </p>
    </div>
  );
}
