import { runScan, type ScanSnapshot } from "./scanner";
import { SCAN_INTERVAL_MS } from "./universe";

/**
 * Feature 3 — pre-computed analysis scheduler.
 *
 * Runs a scan every 15 minutes in the background so the ranked snapshot is
 * ready before a user asks for it. The timer is unref'd so it never keeps the
 * process alive on its own, and the module-level guard makes it idempotent
 * under Next.js hot reloads.
 */

const globalKey = "__marketScanScheduler";
type GlobalWithScheduler = typeof globalThis & {
  [globalKey]?: { timer: ReturnType<typeof setInterval>; running: boolean };
};

export interface SchedulerState {
  running: boolean;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  scanned: number;
  failed: number;
  intervalMs: number;
}

const state: SchedulerState = {
  running: false,
  lastRunAt: null,
  lastDurationMs: null,
  scanned: 0,
  failed: 0,
  intervalMs: SCAN_INTERVAL_MS,
};

async function tick(): Promise<ScanSnapshot> {
  const snapshot = await runScan();
  state.lastRunAt = snapshot.generatedAt;
  state.lastDurationMs = snapshot.durationMs;
  state.scanned = snapshot.scanned;
  state.failed = snapshot.failed;
  return snapshot;
}

/** Starts the interval. Safe to call repeatedly — only one timer is kept. */
export function startScheduler(): void {
  const scope = globalThis as GlobalWithScheduler;
  if (scope[globalKey]) return;

  const timer = setInterval(() => {
    // Skip a cycle if the previous one is still running rather than stacking.
    if (state.running) {
      console.warn("[scanner] previous cycle still running, skipping this tick");
      return;
    }
    state.running = true;
    tick()
      .catch((error) => console.error("[scanner] cycle failed:", error))
      .finally(() => {
        state.running = false;
      });
  }, SCAN_INTERVAL_MS);

  // Do not hold the event loop open just for the scheduler.
  if (typeof timer.unref === "function") timer.unref();

  scope[globalKey] = { timer, running: false };
  state.running = true;
  console.log(`[scanner] scheduler started, interval ${Math.round(SCAN_INTERVAL_MS / 60000)} min`);
}

/** Runs one cycle immediately and populates the cache. */
export async function runNow(): Promise<ScanSnapshot> {
  state.running = true;
  try {
    return await tick();
  } finally {
    state.running = false;
  }
}

export function schedulerState(): SchedulerState {
  return { ...state };
}

export function stopScheduler(): void {
  const scope = globalThis as GlobalWithScheduler;
  if (!scope[globalKey]) return;
  clearInterval(scope[globalKey].timer);
  delete scope[globalKey];
  state.running = false;
}