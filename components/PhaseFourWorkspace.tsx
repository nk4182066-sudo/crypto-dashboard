"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchWithTimeout } from "@/src/lib/fetchClient";

interface DemoCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h?: number | null;
}

interface TaxTrade {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  entry: number;
  exit: number;
  quantity: number;
  pnl: number;
  closedAt: string;
}

interface DemoAccount {
  email: string;
  salt: string;
  passwordHash: string;
  favoriteCoin: string;
  createdAt: string;
}

interface PhaseFourState {
  accounts: DemoAccount[];
  activeEmail: string | null;
  favoriteCoin: string;
}

interface PhaseFourWorkspaceProps {
  coins: DemoCoin[];
  trades: TaxTrade[];
}

const storageKey = "phase4-demo-workspace-v1";
const initialState: PhaseFourState = {
  accounts: [],
  activeEmail: null,
  favoriteCoin: "bitcoin",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function encodeHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, saltHex: string) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" }, key, 256);
  return encodeHex(new Uint8Array(result));
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function PhaseFourWorkspace({ coins, trades }: PhaseFourWorkspaceProps) {
  const [state, setState] = useState<PhaseFourState>(initialState);
  const [storageReady, setStorageReady] = useState(false);
  const [panel, setPanel] = useState("account");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [onchain, setOnchain] = useState<{ total: number; previous: number; top: { symbol: string; supply: number }[]; source: string } | null>(null);
  const [onchainError, setOnchainError] = useState("");
  const [onchainLoading, setOnchainLoading] = useState(false);

  useEffect(() => {
    let restored = initialState;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) restored = { ...initialState, ...JSON.parse(stored) } as PhaseFourState;
    } catch {
      restored = initialState;
    }
    queueMicrotask(() => {
      setState(restored);
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error("Unable to save local Phase 4 state:", error);
    }
  }, [state, storageReady]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setOnchainLoading(true);
      try {
        const response = await fetchWithTimeout("/api/market/onchain");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "On-chain feed unavailable.");
        if (active) {
          setOnchain(result as { total: number; previous: number; top: { symbol: string; supply: number }[]; source: string });
          setOnchainError("");
        }
      } catch (error) {
        if (active) setOnchainError(error instanceof Error ? error.message : "On-chain feed unavailable.");
      } finally {
        if (active) setOnchainLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const activeAccount = state.accounts.find((account) => account.email === state.activeEmail) ?? null;
  const selectedCoin = coins.find((coin) => coin.id === state.favoriteCoin) ?? coins[0];
  const currentTaxTrades = useMemo(() => trades.filter((trade) => new Date(trade.closedAt).getFullYear() === Number(taxYear)), [trades, taxYear]);
  const taxProfit = currentTaxTrades.reduce((total, trade) => total + Math.max(trade.pnl, 0), 0);
  const taxLoss = currentTaxTrades.reduce((total, trade) => total + Math.min(trade.pnl, 0), 0);
  const taxNet = taxProfit + taxLoss;

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const email = emailInput.trim().toLowerCase();
    if (!email.includes("@") || passwordInput.length < 8) {
      setAuthMessage("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    try {
      if (authMode === "signup") {
        if (state.accounts.some((account) => account.email === email)) {
          setAuthMessage("A demo account for this email already exists on this device.");
          return;
        }
        const salt = encodeHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(passwordInput, salt);
        const account: DemoAccount = {
          email,
          salt,
          passwordHash,
          favoriteCoin: selectedCoin?.id ?? "bitcoin",
          createdAt: new Date().toISOString(),
        };
        setState((current) => ({ ...current, accounts: [...current.accounts, account], activeEmail: email, favoriteCoin: account.favoriteCoin }));
        setAuthMessage("Demo profile created on this device.");
      } else {
        const account = state.accounts.find((item) => item.email === email);
        if (!account || await hashPassword(passwordInput, account.salt) !== account.passwordHash) {
          setAuthMessage("Email or password did not match a local demo account.");
          return;
        }
        setState((current) => ({ ...current, activeEmail: email, favoriteCoin: account.favoriteCoin }));
        setAuthMessage("Signed in to this device's demo profile.");
      }
      setPasswordInput("");
    } catch {
      setAuthMessage("This browser does not support the local account demo.");
    }
  }

  function downloadTaxReport() {
    const rows = [
      ["Closed at", "Symbol", "Side", "Entry", "Exit", "Quantity", "Realized P/L USD"],
      ...currentTaxTrades.map((trade) => [trade.closedAt, trade.symbol, trade.side, trade.entry, trade.exit, trade.quantity, trade.pnl]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trade-report-${taxYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const panels = [
    ["account", "Account"],
    ["onchain", "On-chain data"],
    ["tax", "Tax report"],
  ] as const;

  return <section className="min-w-0 border-t border-zinc-800 bg-[#101416] text-zinc-100">
    <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Tools</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Account and reports</h2>
        <span className="text-xs text-zinc-500">Device-local tools · no exchange orders</span>
      </div>
      <nav aria-label="Phase 4 tools" className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {panels.map(([id, label]) => <button key={id} type="button" onClick={() => setPanel(id)} aria-current={panel === id ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium sm:text-sm ${panel === id ? "border-emerald-400 text-emerald-200" : "border-transparent text-zinc-400 hover:text-white"}`}>{label}</button>)}
      </nav>
    </header>

    <div className="space-y-5 p-4 sm:p-6">
      {panel === "account" && <section className="max-w-xl">
        <div className="mb-4"><p className="text-xs uppercase tracking-wide text-sky-300">Device-local demo profile</p><h3 className="mt-1 text-lg font-semibold text-white">Account and preferences</h3><p className="mt-1 text-sm text-zinc-500">This profile is stored in this browser only. It is not a production identity service and does not sync across devices.</p></div>
        {activeAccount ? <div className="space-y-4 border-y border-zinc-800 py-4">
          <p className="text-sm text-zinc-200">Signed in as <strong>{activeAccount.email}</strong></p>
          <label className="block text-sm text-zinc-400">Preferred asset<select value={state.favoriteCoin} onChange={(event) => {
            const favoriteCoin = event.target.value;
            setState((current) => ({ ...current, favoriteCoin, accounts: current.accounts.map((account) => account.email === current.activeEmail ? { ...account, favoriteCoin } : account) }));
          }} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white">{coins.map((coin) => <option key={coin.id} value={coin.id}>{coin.symbol.toUpperCase()} · {coin.name}</option>)}</select></label>
          <button type="button" onClick={() => setState((current) => ({ ...current, activeEmail: null }))} className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-200">Sign out</button>
        </div> : <>
          <div className="mb-3 flex gap-2" role="group" aria-label="Account action"><button type="button" onClick={() => setAuthMode("signup")} aria-pressed={authMode === "signup"} className={`rounded border px-3 py-2 text-sm ${authMode === "signup" ? "border-emerald-400 text-emerald-200" : "border-zinc-700 text-zinc-400"}`}>Sign up</button><button type="button" onClick={() => setAuthMode("login")} aria-pressed={authMode === "login"} className={`rounded border px-3 py-2 text-sm ${authMode === "login" ? "border-emerald-400 text-emerald-200" : "border-zinc-700 text-zinc-400"}`}>Log in</button></div>
          <form onSubmit={handleAccountSubmit} className="grid gap-3 border-y border-zinc-800 py-4">
            <label className="text-sm text-zinc-400">Email<input type="email" autoComplete="email" required value={emailInput} onChange={(event) => setEmailInput(event.target.value)} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
            <label className="text-sm text-zinc-400">Password<input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={8} required value={passwordInput} onChange={(event) => setPasswordInput(event.target.value)} className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
            <button type="submit" className="justify-self-start rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">{authMode === "signup" ? "Create demo account" : "Log in"}</button>
            {authMessage && <p role="status" className="text-sm text-amber-200">{authMessage}</p>}
          </form>
          <p className="mt-3 text-xs text-zinc-600">A salted password hash is stored locally. Do not reuse a password from another service.</p>
        </>}
      </section>}

      {panel === "onchain" && <section>
        <div className="mb-4"><p className="text-xs uppercase tracking-wide text-cyan-300">Public data providers</p><h3 className="mt-1 text-lg font-semibold text-white">On-chain snapshot</h3><p className="mt-1 text-sm text-zinc-500">Stablecoin supply is fetched from DefiLlama. Exchange flows and miner reserves require a provider key not configured in this workspace.</p></div>
        {onchainLoading && <p role="status" className="text-sm text-zinc-400">Refreshing public data...</p>}
        {onchainError && <p role="alert" className="text-sm text-amber-200">{onchainError}</p>}
        {onchain && <>
          <div className="mb-5 grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-3">
            <div><p className="text-[11px] uppercase text-zinc-500">Stablecoin supply</p><p className="mt-1 font-semibold text-white">{money(onchain.total)}</p></div>
            <div><p className="text-[11px] uppercase text-zinc-500">24h change</p><p className={`mt-1 font-semibold ${onchain.total >= onchain.previous ? "text-emerald-300" : "text-rose-300"}`}>{money(onchain.total - onchain.previous)}</p></div>
            <div><p className="text-[11px] uppercase text-zinc-500">Source</p><p className="mt-1 font-semibold text-white">{onchain.source}</p></div>
          </div>
          <h4 className="mb-2 text-sm font-semibold text-white">Largest stablecoin supplies</h4>
          <div className="divide-y divide-zinc-800">{onchain.top.map((item) => <div key={item.symbol} className="flex justify-between gap-3 py-2 text-sm"><span>{item.symbol}</span><span className="text-zinc-300">{money(item.supply)}</span></div>)}</div>
        </>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Exchange inflows / outflows</p><p className="mt-1 text-xs text-zinc-500">Unavailable: an authenticated on-chain metrics provider is not configured.</p></div>
          <div className="border border-zinc-800 p-3"><p className="text-sm font-semibold text-white">Miner reserves</p><p className="mt-1 text-xs text-zinc-500">Unavailable: an authenticated on-chain metrics provider is not configured.</p></div>
        </div>
      </section>}

      {panel === "tax" && <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-amber-300">Journal-based estimate</p><h3 className="mt-1 text-lg font-semibold text-white">Realized trade report</h3><p className="mt-1 text-sm text-zinc-500">CSV export for recordkeeping only; not tax advice or a jurisdiction-specific tax filing.</p></div><label className="text-xs text-zinc-400">Tax year<select value={taxYear} onChange={(event) => setTaxYear(event.target.value)} className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white">{Array.from(new Set([String(new Date().getFullYear()), ...trades.map((trade) => String(new Date(trade.closedAt).getFullYear()))])).sort().reverse().map((year) => <option key={year}>{year}</option>)}</select></label></div>
        <div className="mb-4 grid grid-cols-2 gap-4 border-y border-zinc-800 py-4 sm:grid-cols-4">
          <div><p className="text-[11px] uppercase text-zinc-500">Closed trades</p><p className="mt-1 font-semibold text-white">{currentTaxTrades.length}</p></div>
          <div><p className="text-[11px] uppercase text-zinc-500">Gross gains</p><p className="mt-1 font-semibold text-emerald-300">{money(taxProfit)}</p></div>
          <div><p className="text-[11px] uppercase text-zinc-500">Gross losses</p><p className="mt-1 font-semibold text-rose-300">{money(taxLoss)}</p></div>
          <div><p className="text-[11px] uppercase text-zinc-500">Net realized P/L</p><p className="mt-1 font-semibold text-white">{money(taxNet)}</p></div>
        </div>
        <button type="button" onClick={downloadTaxReport} className="rounded bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">Download CSV</button>
        {currentTaxTrades.length === 0 && <p className="mt-3 text-sm text-zinc-500">No closed journal trades recorded for {taxYear}.</p>}
      </section>}
    </div>
  </section>;
}
