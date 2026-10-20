/**
 * lib/signalMerge.ts — ONE merge policy for local + cloud signal outcomes.
 *
 * Policy (the app's single source of truth for combining two views of the
 * same setup):
 *   - The cloud cron (/api/track-signals) is AUTHORITATIVE for an outcome.
 *   - A local resolution may only UPGRADE a matching setup (a browser that
 *     resolved WIN/LOSS before the cron ran keeps its result) — it can never
 *     downgrade a cloud-resolved setup.
 *   - A PENDING cloud doc never overwrites a locally resolved record.
 *
 * Matching uses the canonical identity (market + canonical symbol + timeframe
 * + dateKey), so two markets never collide and one notation never splits.
 */
import { signalIdentity, type SignalIdentityInput } from "./signalIdentity";

/** True when the status means "this setup already settled". */
export function isResolvedStatus(status: string): boolean {
  return (
    status === "SUCCESS" ||
    status === "FAILED" ||
    status === "EXPIRED" ||
    status === "WIN" ||
    status === "LOSS"
  );
}

/** Normalises the cloud vocabulary (WIN/LOSS) into the local one. */
export function normalizeOutcome(status: string): "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" {
  if (status === "WIN") return "SUCCESS";
  if (status === "LOSS") return "FAILED";
  if (status === "SUCCESS" || status === "FAILED" || status === "EXPIRED") return status;
  return "PENDING";
}

export interface OutcomeView {
  /** "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "WIN" | "LOSS". */
  status: string;
  /** Which level resolved it ("TP1".."TP3" / "SL"), when known. */
  hitTarget: string | null;
  /** Last known price for the asset. */
  currentPrice: number;
}

/**
 * Combine a local record's outcome with the cloud's outcome for the SAME
 * identity. Returns the winning outcome.
 */
export function mergeOutcome(local: OutcomeView, cloud: OutcomeView): OutcomeView {
  const localResolved = isResolvedStatus(local.status);
  const cloudResolved = isResolvedStatus(cloud.status);

  // Cloud wins whenever it has actually resolved the setup.
  if (cloudResolved) {
    return {
      status: cloud.status,
      hitTarget: cloud.hitTarget ?? local.hitTarget,
      currentPrice: cloud.currentPrice > 0 ? cloud.currentPrice : local.currentPrice,
    };
  }
  // Cloud is still PENDING — the local resolution (if any) is kept.
  if (localResolved) {
    return {
      status: local.status,
      hitTarget: local.hitTarget,
      currentPrice: cloud.currentPrice > 0 ? cloud.currentPrice : local.currentPrice,
    };
  }
  // Neither resolved — nothing to upgrade, just carry the freshest price.
  return {
    status: local.status,
    hitTarget: local.hitTarget ?? cloud.hitTarget,
    currentPrice: cloud.currentPrice > 0 ? cloud.currentPrice : local.currentPrice,
  };
}

/** Identity of a cloud doc (market + canonical symbol + timeframe + dateKey). */
export function cloudIdentity(doc: SignalIdentityInput): string {
  return signalIdentity({
    market: doc.market,
    symbol: doc.symbol,
    timeframe: doc.timeframe ?? "1h",
    dateKey: doc.dateKey ?? undefined,
    createdAt: doc.createdAt ?? undefined,
  });
}
