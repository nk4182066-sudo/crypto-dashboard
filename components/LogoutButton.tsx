"use client";

// Simple logout button for the header. Signs out of Firebase (via the firebase
// helper, which also clears the onboarding flag) and the stored user, then
// reloads so the app returns to the onboarding/register flow. Educational only.
import { useState } from "react";
import { signOutUser } from "@/src/lib/firebase";
import { clearUser } from "@/src/lib/userAuth";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      clearUser();
      await signOutUser();
    } catch (error) {
      console.warn("[auth] sign-out failed:", error);
    } finally {
      // Reload regardless so the flow restarts cleanly.
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-60"
      style={{ borderColor: "#2B3139", color: "#F6465D" }}
    >
      {busy ? "..." : "Logout"}
    </button>
  );
}
