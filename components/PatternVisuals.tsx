"use client";

// Shared SVG diagrams for the pattern library. Every candlestick pattern and
// chart pattern gets a small, responsive vector visual so the shape is taught
// before detection fires. Educational only — not financial advice.
import type { ReactNode } from "react";

export const GREEN = "#00C087";
export const RED = "#F6465D";
export const GRAY = "#9CA3AF";

/** One candlestick: wick line + body rect. SVG y grows downward (top = higher price). */
function Candle({ x, color, high, low, bodyTop, bodyBottom, width = 26 }: { x: number; color: string; high: number; low: number; bodyTop: number; bodyBottom: number; width?: number }) {
  const h = Math.max(3, bodyBottom - bodyTop);
  return (
    <g>
      <line x1={x} y1={high} x2={x} y2={low} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <rect x={x - width / 2} y={bodyTop} width={width} height={h} rx={1} fill={color} />
    </g>
  );
}

/** The candle group for a given candlestick pattern name (140×220 canvas). */
function candlestickShape(name: string): ReactNode {
  switch (name.toLowerCase()) {
    // ── Single-candle ──
    case "hammer": // small body top, long lower wick
      return <Candle x={70} color={GREEN} high={40} low={178} bodyTop={62} bodyBottom={98} />;
    case "inverted hammer": // small body bottom, long upper wick
      return <Candle x={70} color={GREEN} high={30} low={104} bodyTop={104} bodyBottom={138} />;
    case "shooting star": // long upper wick, small body bottom
      return <Candle x={70} color={RED} high={26} low={104} bodyTop={104} bodyBottom={138} />;
    case "hanging man": // small body top, long lower wick (bearish context)
      return <Candle x={70} color={RED} high={58} low={178} bodyTop={58} bodyBottom={92} />;
    case "doji": // tiny body, both wicks
      return <Candle x={70} color={GRAY} high={32} low={186} bodyTop={100} bodyBottom={116} width={30} />;
    case "dragonfly doji": // body at top, long lower wick
      return <Candle x={70} color={GREEN} high={56} low={182} bodyTop={56} bodyBottom={74} width={30} />;
    case "gravestone doji": // body at bottom, long upper wick
      return <Candle x={70} color={RED} high={28} low={154} bodyTop={136} bodyBottom={154} width={30} />;
    case "spinning top": // small body, moderate both wicks
      return <Candle x={70} color={GRAY} high={48} low={172} bodyTop={92} bodyBottom={120} width={30} />;
    case "long-legged doji": // tiny body, very long both wicks
      return <Candle x={70} color={GRAY} high={24} low={192} bodyTop={100} bodyBottom={114} width={28} />;
    case "four price doji": // flat line (open=high=low=close)
      return <line x1={40} y1={108} x2={100} y2={108} stroke={GRAY} strokeWidth={4} strokeLinecap="round" />;
    case "high wave": // small body, very long both wicks
      return <Candle x={70} color={GRAY} high={20} low={196} bodyTop={94} bodyBottom={118} width={26} />;
    case "bullish marubozu": // full green, no wicks
      return <Candle x={70} color={GREEN} high={44} low={176} bodyTop={44} bodyBottom={176} />;
    case "bearish marubozu": // full red, no wicks
      return <Candle x={70} color={RED} high={44} low={176} bodyTop={44} bodyBottom={176} />;

    // ── Two-candle ──
    case "bullish engulfing": // small red, large green covers it
      return (<>
        <Candle x={44} color={RED} high={92} low={140} bodyTop={98} bodyBottom={134} />
        <Candle x={98} color={GREEN} high={44} low={168} bodyTop={52} bodyBottom={160} />
      </>);
    case "bearish engulfing": // small green, large red covers it
      return (<>
        <Candle x={44} color={GREEN} high={86} low={132} bodyTop={92} bodyBottom={126} />
        <Candle x={98} color={RED} high={44} low={168} bodyTop={52} bodyBottom={160} />
      </>);
    case "piercing line": // red, then green closes above red midpoint
      return (<>
        <Candle x={44} color={RED} high={46} low={122} bodyTop={52} bodyBottom={116} />
        <Candle x={98} color={GREEN} high={100} low={62} bodyTop={104} bodyBottom={68} />
      </>);
    case "dark cloud cover": // green, then red closes below green midpoint
      return (<>
        <Candle x={44} color={GREEN} high={46} low={116} bodyTop={52} bodyBottom={110} />
        <Candle x={98} color={RED} high={50} low={104} bodyTop={54} bodyBottom={98} />
      </>);
    case "bullish harami": // big red, small green inside
      return (<>
        <Candle x={44} color={RED} high={44} low={168} bodyTop={50} bodyBottom={162} />
        <Candle x={98} color={GREEN} high={86} low={124} bodyTop={92} bodyBottom={118} />
      </>);
    case "bearish harami": // big green, small red inside
      return (<>
        <Candle x={44} color={GREEN} high={44} low={168} bodyTop={50} bodyBottom={162} />
        <Candle x={98} color={RED} high={86} low={124} bodyTop={92} bodyBottom={118} />
      </>);
    case "tweezer bottom": // two candles sharing the same low
      return (<>
        <Candle x={44} color={RED} high={54} low={144} bodyTop={60} bodyBottom={138} />
        <Candle x={98} color={GREEN} high={62} low={144} bodyTop={98} bodyBottom={138} />
      </>);
    case "tweezer top": // two candles sharing the same high
      return (<>
        <Candle x={44} color={GREEN} high={54} low={144} bodyTop={60} bodyBottom={104} />
        <Candle x={98} color={RED} high={54} low={140} bodyTop={60} bodyBottom={100} />
      </>);

    // ── Three-candle ──
    case "morning star": // big red, small doji, big green closing above red midpoint
      return (<>
        <Candle x={28} color={RED} high={44} low={120} bodyTop={50} bodyBottom={114} />
        <Candle x={70} color={GRAY} high={102} low={134} bodyTop={112} bodyBottom={120} width={22} />
        <Candle x={112} color={GREEN} high={40} low={74} bodyTop={46} bodyBottom={70} />
      </>);
    case "evening star": // big green, small doji, big red closing below green midpoint
      return (<>
        <Candle x={28} color={GREEN} high={42} low={112} bodyTop={48} bodyBottom={106} />
        <Candle x={70} color={GRAY} high={70} low={102} bodyTop={80} bodyBottom={88} width={22} />
        <Candle x={112} color={RED} high={70} low={136} bodyTop={76} bodyBottom={130} />
      </>);
    case "three white soldiers": // 3 rising green candles
      return (<>
        <Candle x={28} color={GREEN} high={92} low={146} bodyTop={98} bodyBottom={140} />
        <Candle x={70} color={GREEN} high={70} low={124} bodyTop={76} bodyBottom={118} />
        <Candle x={112} color={GREEN} high={48} low={102} bodyTop={54} bodyBottom={96} />
      </>);
    case "three black crows": // 3 falling red candles
      return (<>
        <Candle x={28} color={RED} high={56} low={110} bodyTop={62} bodyBottom={104} />
        <Candle x={70} color={RED} high={78} low={132} bodyTop={84} bodyBottom={126} />
        <Candle x={112} color={RED} high={100} low={154} bodyTop={106} bodyBottom={148} />
      </>);
    case "three inside up/down": // harami then a confirming candle
      return (<>
        <Candle x={26} color={RED} high={52} low={158} bodyTop={58} bodyBottom={152} />
        <Candle x={70} color={GREEN} high={88} low={126} bodyTop={94} bodyBottom={120} width={22} />
        <Candle x={114} color={GREEN} high={54} low={116} bodyTop={60} bodyBottom={110} />
      </>);
    case "three outside up/down": // engulfing then a confirming candle
      return (<>
        <Candle x={26} color={GREEN} high={98} low={132} bodyTop={104} bodyBottom={126} width={22} />
        <Candle x={70} color={RED} high={60} low={158} bodyTop={66} bodyBottom={152} />
        <Candle x={114} color={GREEN} high={54} low={116} bodyTop={60} bodyBottom={110} />
      </>);
    case "abandoned baby": // red, isolated doji (gap), green (gap)
      return (<>
        <Candle x={26} color={RED} high={62} low={124} bodyTop={68} bodyBottom={118} />
        <Candle x={70} color={GRAY} high={156} low={178} bodyTop={162} bodyBottom={172} width={22} />
        <Candle x={114} color={GREEN} high={38} low={82} bodyTop={44} bodyBottom={76} />
      </>);
    case "tri-star": // 3 dojis, middle one at the extreme
      return (<>
        <Candle x={28} color={GRAY} high={98} low={116} bodyTop={104} bodyBottom={110} width={22} />
        <Candle x={70} color={GRAY} high={142} low={160} bodyTop={148} bodyBottom={154} width={22} />
        <Candle x={112} color={GRAY} high={100} low={118} bodyTop={106} bodyBottom={112} width={22} />
      </>);
    case "stick sandwich": // two red at the same close, green between
      return (<>
        <Candle x={28} color={RED} high={72} low={144} bodyTop={78} bodyBottom={138} />
        <Candle x={70} color={GREEN} high={54} low={116} bodyTop={60} bodyBottom={110} />
        <Candle x={112} color={RED} high={72} low={144} bodyTop={78} bodyBottom={138} />
      </>);

    default: // unknown — a neutral doji
      return <Candle x={70} color={GRAY} high={48} low={172} bodyTop={96} bodyBottom={120} width={30} />;
  }
}

/** Big, centered candlestick diagram for a detail page. */
export function CandlestickVisual({ name, className = "mx-auto h-64 w-40" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 140 220" className={className} role="img" aria-label={`${name} pattern diagram`}>
      {candlestickShape(name)}
    </svg>
  );
}

/** Helper requested by the task: pattern name -> diagram. */
export function getCandlestickVisual(name: string, className?: string): ReactNode {
  return <CandlestickVisual name={name} className={className} />;
}

export type ChartPatternType = "bullish" | "bearish" | "neutral";

/** The price-path + guide-line group for a chart pattern name (200×100 canvas). */
function chartPatternShape(name: string, type: ChartPatternType): ReactNode {
  const price = { stroke: type === "bullish" ? GREEN : type === "bearish" ? RED : GRAY, fill: "none", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const guide = { stroke: "#FFFFFF", strokeDasharray: "4 4", strokeWidth: 1.5 };
  let shape: ReactNode;
  switch (name) {
    // ── Reversal shapes ──
    case "Double Bottom": // W shape + neckline
      shape = (<><path d="M10,30 L50,72 L90,30 L130,72 L170,30" {...price} /><line x1="10" y1="30" x2="190" y2="30" {...guide} /></>); break;
    case "Double Top": // M shape + support line
      shape = (<><path d="M10,70 L50,28 L90,70 L130,28 L170,70" {...price} /><line x1="10" y1="70" x2="190" y2="70" {...guide} /></>); break;
    case "Triple Top": // 3 peaks + support line
      shape = (<><path d="M8,68 L38,30 L66,68 L98,30 L126,68 L158,30 L188,68" {...price} /><line x1="8" y1="68" x2="190" y2="68" {...guide} /></>); break;
    case "Triple Bottom": // 3 valleys + neckline
      shape = (<><path d="M8,32 L38,70 L66,32 L98,70 L126,32 L158,70 L188,32" {...price} /><line x1="8" y1="32" x2="190" y2="32" {...guide} /></>); break;
    case "Head & Shoulders": // 3 peaks (middle tallest) + neckline
      shape = (<><path d="M10,64 L44,34 L68,64 L100,20 L132,64 L156,34 L190,64" {...price} /><line x1="10" y1="64" x2="190" y2="64" {...guide} /></>); break;
    case "Inverse Head & Shoulders": // inverted 3 peaks + neckline
      shape = (<><path d="M10,36 L44,66 L68,36 L100,80 L132,36 L156,66 L190,36" {...price} /><line x1="10" y1="36" x2="190" y2="36" {...guide} /></>); break;
    case "Cup & Handle": // U shape + small dip
      shape = (<><path d="M10,30 C48,96 104,96 142,36 L156,50 L168,38 L184,34" {...price} /><line x1="10" y1="30" x2="190" y2="30" {...guide} /></>); break;
    case "Inverse Cup & Handle": // inverted U + small rally
      shape = (<><path d="M10,70 C48,4 104,4 142,64 L156,50 L168,62 L184,66" {...price} /><line x1="10" y1="70" x2="190" y2="70" {...guide} /></>); break;
    case "Rounding Top": // rounded peak
      shape = (<><path d="M10,72 C62,4 138,4 190,72" {...price} /><line x1="10" y1="72" x2="190" y2="72" {...guide} /></>); break;
    case "Rounding Bottom": // rounded trough
      shape = (<><path d="M10,28 C62,96 138,96 190,28" {...price} /><line x1="10" y1="28" x2="190" y2="28" {...guide} /></>); break;

    // ── Continuation shapes ──
    case "Ascending Triangle": // flat resistance + rising support
      shape = (<><line x1="10" y1="32" x2="190" y2="32" {...guide} /><line x1="10" y1="86" x2="190" y2="42" {...guide} /><path d="M14,80 L52,44 L86,76 L122,50 L158,70 L184,40" {...price} /></>); break;
    case "Descending Triangle": // flat support + falling resistance
      shape = (<><line x1="10" y1="68" x2="190" y2="68" {...guide} /><line x1="10" y1="30" x2="190" y2="60" {...guide} /><path d="M14,38 L52,64 L86,44 L122,62 L158,50 L184,66" {...price} /></>); break;
    case "Symmetrical Triangle": // both lines converge
      shape = (<><line x1="10" y1="30" x2="190" y2="58" {...guide} /><line x1="10" y1="88" x2="190" y2="64" {...guide} /><path d="M14,78 L52,42 L86,70 L122,48 L158,64 L184,56" {...price} /></>); break;
    case "Bull Flag": // pole + downward rectangle
      shape = (<><path d="M18,88 L46,32" {...price} /><path d="M46,32 L98,48 L98,74 L46,58 Z" {...guide} /><path d="M98,48 L178,22" {...price} /></>); break;
    case "Bear Flag": // pole + upward rectangle
      shape = (<><path d="M18,14 L46,70" {...price} /><path d="M46,70 L98,54 L98,28 L46,44 Z" {...guide} /><path d="M98,54 L178,80" {...price} /></>); break;
    case "Pennant": // pole + small triangle
      shape = (<><path d="M18,88 L54,30" {...price} /><path d="M54,30 L110,52 L54,70" {...guide} /><path d="M110,52 L180,26" {...price} /></>); break;
    case "Rising Wedge": // converging rising lines
      shape = (<><line x1="10" y1="84" x2="190" y2="40" {...guide} /><line x1="10" y1="96" x2="190" y2="46" {...guide} /><path d="M16,90 L56,58 L96,74 L136,52 L176,60" {...price} /></>); break;
    case "Falling Wedge": // converging falling lines
      shape = (<><line x1="10" y1="26" x2="190" y2="72" {...guide} /><line x1="10" y1="12" x2="190" y2="64" {...guide} /><path d="M16,18 L56,50 L96,34 L136,56 L176,46" {...price} /></>); break;
    case "Rectangle": // horizontal channel
      shape = (<><line x1="10" y1="30" x2="190" y2="30" {...guide} /><line x1="10" y1="72" x2="190" y2="72" {...guide} /><path d="M14,66 L54,36 L94,66 L134,36 L174,66" {...price} /></>); break;
    case "Channel Up": // rising parallel lines
      shape = (<><line x1="10" y1="86" x2="190" y2="44" {...guide} /><line x1="10" y1="58" x2="190" y2="16" {...guide} /><path d="M16,78 L56,52 L96,60 L136,32 L176,42" {...price} /></>); break;
    case "Channel Down": // falling parallel lines
      shape = (<><line x1="10" y1="16" x2="190" y2="58" {...guide} /><line x1="10" y1="44" x2="190" y2="86" {...guide} /><path d="M16,40 L56,33 L96,60 L136,52 L176,80" {...price} /></>); break;
    case "Diamond": // diamond outline
      shape = (<><path d="M100,16 L176,52 L100,88 L24,52 Z" {...guide} /><path d="M56,52 L84,36 L112,64 L144,52" {...price} /></>); break;

    // ── Harmonic shapes (X-A-B-C-D zigzag) ──
    case "Gartley":
    case "Butterfly":
    case "Bat":
      shape = (<><path d="M14,80 L58,24 L100,64 L138,34 L184,74" {...price} /><line x1="100" y1="74" x2="192" y2="74" {...guide} /></>); break;

    default: // unknown name -> generic zigzag
      shape = <path d="M10,70 L50,30 L90,66 L130,34 L170,58" {...price} />;
  }
  return shape;
}

/** Chart pattern diagram. `big` renders a taller version for the detail page. */
export function ChartPatternVisual({ name, type, big = false, className }: { name: string; type: ChartPatternType; big?: boolean; className?: string }) {
  const size = className ?? (big ? "mx-auto h-48 w-full max-w-md" : "h-20 w-full");
  return (
    <svg viewBox="0 0 200 100" className={size} fill="none" role="img" aria-label={`${name} pattern diagram`}>
      {chartPatternShape(name, type)}
    </svg>
  );
}

/** Helper: chart pattern name -> diagram. */
export function getChartPatternVisual(name: string, type: ChartPatternType, className?: string): ReactNode {
  return <ChartPatternVisual name={name} type={type} className={className} />;
}
