"use client";

// Masla 3 — top-right user avatar with a Profile / Settings / Logout dropdown.
// Reads the stored user, shows a first-letter avatar with a green border, and
// signs out via Firebase + localStorage (keeps onboarding-complete so the flow
// does not reshow). Educational only. Not financial advice.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCurrentUser, signOutFlow, type AppUser } from "@/src/lib/userAuth";

const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const GREEN = "#00C087";

/** First letter of the name (or phone) for the round avatar. */
function avatarLetter(user: AppUser | null): string {
  const source = user?.name || user?.phone || "?";
  const clean = source.trim();
  if (!clean) return "?";
  return clean.charAt(0).toUpperCase();
}

export default function UserMenu() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  // Close the dropdown on any outside click / tap.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleLogout() {
    setOpen(false);
    await signOutFlow();
    // Full navigation to /login (fresh login screen), never back to dashboard.
    window.location.assign("/login");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-transform hover:scale-105"
        style={{ borderColor: GREEN, backgroundColor: "#1E2329", color: TEXT }}
      >
        {avatarLetter(user)}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border py-1 shadow-2xl"
          style={{ backgroundColor: CARD, borderColor: BORDER }}
        >
          <div className="border-b px-4 py-2" style={{ borderColor: BORDER }}>
            <p className="truncate text-sm font-semibold" style={{ color: TEXT }}>
              {user?.name || user?.phone || "Guest"}
            </p>
            <p className="text-[11px]" style={{ color: MUTED }}>
              {user?.provider ? `${user.provider} account` : "Not signed in"}
            </p>
          </div>

          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm transition-colors hover:bg-white/5"
            style={{ color: TEXT }}
          >
            👤 Profile
          </Link>
          <Link
            href="/risk"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm transition-colors hover:bg-white/5"
            style={{ color: TEXT }}
          >
            ⚙️ Settings
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
            style={{ color: "#F6465D" }}
          >
            🚪 Logout
          </button>
        </div>
      )}
    </div>
  );
}
