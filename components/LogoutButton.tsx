"use client";

// Header logout button. Signs out of Firebase first (session), then wipes ALL
// client storage per spec — localStorage.clear() + sessionStorage.clear() —
// shows a "Logout successful" toast, then redirects to /login (NOT the
// dashboard) so the next login starts clean. Self-contained toast (no external
// lib). Educational only.
import { useState } from "react";
import { signOutUser } from "@/src/lib/firebase";
import { clearUser } from "@/src/lib/userAuth";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      // 1) Firebase sign-out (signOutUser wraps firebase signOut + clears ALL
      //    localStorage + sessionStorage, including the onboarding flag, so the
      //    dashboard does NOT reopen). No-op when Firebase is not configured.
      await signOutUser();
    } catch (error) {
      console.warn("[auth] sign-out failed:", error);
    }
    try {
      // 2) Belt-and-braces wipe: stored user + any session leftovers. Runs
      //    AFTER signOut so Firebase's own auth persistence is removed cleanly.
      clearUser();
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      console.warn("[auth] storage clear failed:", error);
    }
    // 3) Toast, then hard-navigate to /login so the login screen appears —
    //    never the dashboard (full reload drops all in-memory app state too).
    setToast(true);
    window.setTimeout(() => {
      window.location.assign("/login");
    }, 1200);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-60"
        style={{ borderColor: "#2B3139", color: "#F6465D" }}
      >
        {busy ? "..." : "Logout"}
      </button>

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 top-6 z-[10000] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-lg"
          style={{ backgroundColor: "#181A20", borderColor: "#00C087", color: "#EAECEF" }}
        >
          <span style={{ color: "#00C087" }}>✓</span> Logout successful
        </div>
      )}
    </>
  );
}

