"use client";

// Navbar: top navigation for desktop + bottom tab bar for mobile.
// Educational tool only. Not financial advice.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Bitget-style palette
const CARD = "#181A20";
const BORDER = "#2B3139";
const TEXT = "#EAECEF";
const MUTED = "#848E9C";
const GREEN = "#00C087";

const TOP_LINKS = [
  { href: "/", label: "Home" },
  { href: "/markets", label: "Markets" },
  { href: "/trade", label: "Trade" },
  { href: "/signals", label: "Signals" },
  { href: "/risk", label: "Risk" },
  { href: "/chat", label: "Chat" },
  { href: "/patterns", label: "Patterns" },
];

const BOTTOM_LINKS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/markets", label: "Markets", icon: "📊" },
  { href: "/trade", label: "Trade", icon: "📈" },
  { href: "/signals", label: "Signals", icon: "⚡" },
  { href: "/patterns", label: "Assets", icon: "💰" },
];

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(base + "/");
}

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <>
      {/* Top navbar — sticky, 56px */}
      <header
        className="sticky top-0 z-50 w-full border-b"
        style={{ backgroundColor: CARD, borderColor: BORDER }}
      >
        <nav className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-black"
              style={{ backgroundColor: GREEN, color: "#0B0E11" }}
            >
              T
            </span>
            <span className="hidden text-sm font-bold sm:inline" style={{ color: TEXT }}>
              Trading Student Expert AI
            </span>
          </Link>

          {/* Search bar — rounded, gray bg */}
          <div className="hidden flex-1 md:block">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search coin..."
              className="w-full max-w-md rounded-full border px-4 py-1.5 text-sm outline-none focus:border-[#00C087]"
              style={{ backgroundColor: "#1E2329", borderColor: BORDER, color: TEXT }}
            />
          </div>

          {/* Desktop links — active = green underline/bg */}
          <ul className="ml-auto hidden items-center gap-1 lg:flex">
            {TOP_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="relative block rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{
                      color: active ? GREEN : MUTED,
                      backgroundColor: active ? "#1E2329" : "transparent",
                    }}
                  >
                    {link.label}
                    {active && (
                      <span
                        className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full"
                        style={{ backgroundColor: GREEN }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-md border lg:hidden"
            style={{ borderColor: BORDER, color: TEXT }}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </nav>

        {/* Mobile dropdown */}
        {open && (
          <ul className="border-t lg:hidden" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            {TOP_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 text-sm font-medium"
                    style={{ color: active ? GREEN : MUTED }}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </header>

      {/* Bottom tab bar (mobile) — 5 equal tabs, 60px, safe-area aware */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t lg:hidden"
        style={{ backgroundColor: CARD, borderColor: BORDER, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex h-[60px] items-stretch">
          {BOTTOM_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <li key={link.label} className="flex-1 min-w-0">
                <Link
                  href={link.href}
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors"
                  style={{ color: active ? GREEN : MUTED }}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-xl leading-none">{link.icon}</span>
                  <span className="truncate max-w-full">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
