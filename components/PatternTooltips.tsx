"use client";

/**
 * Roman Urdu explanations help Pakistani users
 * understand trading patterns easily.
 * Educational only. Not financial advice.
 */

import { useId, useState, type ReactNode } from "react";

export interface PatternInfo {
  /** Canonical English pattern name. */
  name: string;
  /** Plain Roman Urdu description of the shape. */
  romanUrdu: string;
  /** The meaning, in one line. */
  matlab: string;
  /** What a beginner should actually do with it. */
  kyaKarein: string;
}

export const PATTERN_INFO: Record<string, PatternInfo> = {
  Doji: {
    name: "Doji",
    romanUrdu: "Ye chhoti body aur lambi wicks wali candle hai. Open aur close qareeb qareeb hain.",
    matlab: "Market confused hai, koi taraf qeem nahi kar raha.",
    kyaKarein: "Trade lene se pehle intezaar karein. Next candle ka direction dekhein.",
  },
  Hammer: {
    name: "Hammer",
    romanUrdu: "Neeche lambi wick aur upar chhoti body. Matlab sellers ne neeche push kiya phir wapas upar aaya.",
    matlab: "Neeche se demand aya, price wapas upar ja sakta hai.",
    kyaKarein: "Agar ye support par bane to upar jaane ka setup samjhein, phir confirm ka intezaar karein.",
  },
  "Shooting Star": {
    name: "Shooting Star",
    romanUrdu: "Upar lambi wick aur neeche chhoti body. Matlab buyers ne upar push kiya phir wapas neeche aa gaye.",
    matlab: "Upar se sellers ne pressure daala, price gir sakta hai.",
    kyaKarein: "Agar ye resistance par bane to neeche jaane ka setup samjhein, confirm ka intezaar karein.",
  },
  "Bullish Engulfing": {
    name: "Bullish Engulfing",
    romanUrdu: "Pehle red candle thi, uske baad ek badi green candle aayi jisne poori red candle ko cover kar diya.",
    matlab: "Buyers ne sellers ko hara diya, momentum upar gaya.",
    kyaKarein: "Support ke paas aaye to bullish setup samjhein. Stop loss hamesha candle ke neeche rakhein.",
  },
  "Bearish Engulfing": {
    name: "Bearish Engulfing",
    romanUrdu: "Pehle green candle thi, uske baad ek badi red candle aayi jisne poori green candle ko cover kar diya.",
    matlab: "Sellers ne buyers ko hara diya, momentum neeche gaya.",
    kyaKarein: "Resistance ke paas aaye to bearish setup samjhein. Stop loss hamesha candle ke upar rakhein.",
  },
  "Support Zone": {
    name: "Support Zone",
    romanUrdu: "Yahan price neeche girne se ruk jati hai. Ye ek floor ki tarah kaam karta hai.",
    matlab: "Buyers yahan strong hote hain.",
    kyaKarein: "Price yahan pohanche to bounce ka intezaar karein. Neeche ka breakout ho to pareshan na hon.",
  },
  "Resistance Zone": {
    name: "Resistance Zone",
    romanUrdu: "Yahan price upar jaane se ruk jati hai. Ye ek ceiling ki tarah kaam karta hai.",
    matlab: "Sellers yahan strong hote hain.",
    kyaKarein: "Price yahan pohanche to neeche girne ka intezaar karein. Upar ka breakout ho to pareshan na hon.",
  },
  "Volume Bar": {
    name: "Volume Bar",
    romanUrdu: "Har candle ke neeche wali patti. Jitni bari patti, utna zyada trading hui us time.",
    matlab: "Bari volume ke saath move mazboot hota hai.",
    kyaKarein: "Breakout par volume bar bari hon to move qeem hai. Choti volume par breakout kamzor hota hai.",
  },
  "Trend Line": {
    name: "Trend Line",
    romanUrdu: "Chart par diagonal line jo market ka rujhaad (trend) dikhati hai.",
    matlab: "Market upar ja raha hai ya neeche, ye line bataati hai.",
    kyaKarein: "Price trend line par respect kare to usi dis mein sochein. Line ke torne ke baad intezaar karein.",
  },
  Breakout: {
    name: "Breakout",
    romanUrdu: "Jab price purani limit (support ya resistance) se bahar nikal jati hai.",
    matlab: "Market ne range tod diya, nayi direction shuru ho sakti hai.",
    kyaKarein: "Breakout par volume check karein. Kam volume wala breakout aksar nakli hota hai.",
  },
};

/** Case-insensitive lookup that also tolerates the " Zone" suffix variants. */
export function getPatternInfo(key: string | undefined | null): PatternInfo | null {
  if (!key) return null;
  if (PATTERN_INFO[key]) return PATTERN_INFO[key];
  const trimmed = key.replace(/\s*Zone$/i, "").trim();
  return PATTERN_INFO[trimmed] ?? PATTERN_INFO[`${trimmed} Zone`] ?? null;
}

export interface PatternTooltipProps {
  /** Pattern name to look up in {@link PATTERN_INFO}. */
  pattern: string;
  /** Trigger element; hovering it reveals the tooltip. */
  children: ReactNode;
}

/**
 * Floating Roman Urdu explainer shown on hover/focus.
 *
 * Rendered inside a `relative` wrapper so it stays anchored to its trigger. The
 * box is keyboard reachable (tabIndex + focus handlers) so it works without a
 * mouse, and it closes on Escape.
 */
export default function PatternTooltip({ pattern, children }: PatternTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const info = getPatternInfo(pattern);

  // An unknown pattern renders its children untouched rather than an empty box.
  if (!info) return <>{children}</>;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <span
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        className="outline-none focus-visible:underline"
      >
        {children}
      </span>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-left text-xs leading-relaxed text-zinc-200 shadow-xl shadow-black/40"
        >
          <span className="block font-semibold text-white">{info.name}</span>
          <span className="mt-1 block text-zinc-300">{info.romanUrdu}</span>
          <span className="mt-1.5 block text-zinc-400">
            <span className="font-medium text-zinc-300">Matlab: </span>
            {info.matlab}
          </span>
          <span className="mt-1.5 block text-zinc-400">
            <span className="font-medium text-emerald-300">Kya karein: </span>
            {info.kyaKarein}
          </span>
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-zinc-700 bg-zinc-900" />
        </span>
      )}
    </span>
  );
}