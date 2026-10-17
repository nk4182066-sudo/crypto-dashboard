"use client";

// Strict route protection wrapper.
//
// Logic:
//  - Wab tak Firebase auth state resolve na ho jaye → AuthLoadingScreen dikhao.
//  - Agar user nahi hai aur public route (/login, /signup) pe nahi hai → /login pe redirect.
//  - Agar user hai aur /login ya /signup pe hai → / pe redirect.
//  - Agar user hai → children render karo.
//
// Note: `react-firebase-hooks` is NOT installed in this project (package.json only
// has `firebase`), so the native Firebase `onAuthStateChanged` listener is used.
// Same behaviour as `useAuthState`, no extra dependency — and it matches the
// requirement to use onAuthStateChanged on app load.
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/src/lib/firebase";

// Public routes — login / signup are open to everyone (no auth required).
const PUBLIC_ROUTES = ["/login", "/signup"];

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Requirement #6 — Firebase auth listener on app load.
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser ?? null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Requirement #5 — redirect logic.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!user && !isPublic) {
      router.replace("/login");
    } else if (user && isPublic) {
      router.replace("/");
    }
  }, [user, loading, pathname, router]);

  if (loading) return <AuthLoadingScreen />;
  if (!user) return null;
  return <>{children}</>;
}

function AuthLoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-3"
      style={{ backgroundColor: "#0B0E11", color: "#EAECEF" }}
    >
      <div
        className="h-10 w-10 rounded-full border-4 border-[#00C087]/20 border-t-[#00C087] animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm font-medium">Auth check ho raha hai…</p>
    </div>
  );
}
