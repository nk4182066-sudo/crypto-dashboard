"use client";

import { useRef } from "react";

export type TradeVerdict = "Take Entry" | "Wait" | "Do Not Enter";

export interface RiskRewardSummary {
  balance: string;
  risk: string;
  lotSize: string;
  riskReward: string;
}

export type ChartAnnotation =
  | {
      type: "horizontal";
      category: "support" | "resistance" | "stopLoss" | "takeProfit";
      y: number;
      label: string;
    }
  | {
      type: "trendline";
      category: "upperTrend" | "lowerTrend";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      label: string;
    }
  | {
      type: "pattern";
      name: string;
      points: { x: number; y: number }[];
      label: string;
    }
  | {
      type: "entry";
      direction: "buy" | "sell";
      x: number;
      y: number;
      label: string;
    };

interface AnnotatedChartProps {
  image: string;
  annotations: ChartAnnotation[];
  verdict: TradeVerdict;
  riskReward: RiskRewardSummary;
}

const coordinate = (value: number) => Math.max(0, Math.min(1000, value));

const horizontalColors = {
  support: "#22c55e",
  resistance: "#ef4444",
  stopLoss: "#ef4444",
  takeProfit: "#22c55e",
};

export default function AnnotatedChart({ image, annotations, verdict, riskReward }: AnnotatedChartProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const downloadImage = () => {
    const svg = svgRef.current;
    const imageElement = imageRef.current;
    if (!svg || !imageElement) return;

    const exportSvg = svg.cloneNode(true) as SVGSVGElement;
    exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    exportSvg.setAttribute("width", String(imageElement.naturalWidth));
    exportSvg.setAttribute("height", String(imageElement.naturalHeight));

    const background = document.createElementNS("http://www.w3.org/2000/svg", "image");
    background.setAttribute("href", image);
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", "1000");
    background.setAttribute("height", "1000");
    background.setAttribute("preserveAspectRatio", "none");
    exportSvg.insertBefore(background, exportSvg.firstChild);

    const blob = new Blob([new XMLSerializer().serializeToString(exportSvg)], { type: "image/svg+xml;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "annotated-trading-chart.svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  };

  const verdictColor = verdict === "Take Entry" ? "#22c55e" : verdict === "Do Not Enter" ? "#ef4444" : "#f59e0b";

  return (
    <div className="w-full space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">
        <img ref={imageRef} src={image} alt="Chart screenshot marked with technical analysis" className="block h-auto w-full" />
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          role="img"
          aria-label="Support, resistance, trend, entry, stop loss, take profit, and risk-reward annotations"
          className="absolute inset-0 h-full w-full"
        >
          {annotations.map((annotation, index) => {
            if (annotation.type === "horizontal") {
              const y = coordinate(annotation.y);
              const color = horizontalColors[annotation.category];
              const dashed = annotation.category === "stopLoss" || annotation.category === "takeProfit";
              return (
                <g key={`horizontal-${index}`}>
                  <line x1="0" y1={y} x2="1000" y2={y} stroke={color} strokeWidth="3" strokeDasharray={dashed ? "12 8" : undefined} />
                  <rect x="12" y={coordinate(y - 28)} width="290" height="26" rx="5" fill="#09090b" fillOpacity="0.88" />
                  <text x="22" y={coordinate(y - 10)} fill={color} fontSize="17" fontWeight="700">{annotation.label}</text>
                </g>
              );
            }

            if (annotation.type === "trendline") {
              const color = annotation.category === "upperTrend" ? "#f59e0b" : "#06b6d4";
              return (
                <g key={`trend-${index}`}>
                  <line x1={coordinate(annotation.x1)} y1={coordinate(annotation.y1)} x2={coordinate(annotation.x2)} y2={coordinate(annotation.y2)} stroke={color} strokeWidth="4" />
                  <text x={coordinate((annotation.x1 + annotation.x2) / 2)} y={coordinate((annotation.y1 + annotation.y2) / 2 - 12)} fill={color} fontSize="18" fontWeight="700" paintOrder="stroke" stroke="#09090b" strokeWidth="5">{annotation.label}</text>
                </g>
              );
            }

            if (annotation.type === "pattern") {
              const points = annotation.points.map((point) => `${coordinate(point.x)},${coordinate(point.y)}`).join(" ");
              const firstPoint = annotation.points[0];
              return (
                <g key={`pattern-${index}`}>
                  <polygon points={points} fill="#f59e0b" fillOpacity="0.1" stroke="#f59e0b" strokeWidth="4" strokeDasharray="10 6" />
                  {firstPoint && <text x={coordinate(firstPoint.x)} y={coordinate(firstPoint.y - 12)} fill="#fbbf24" fontSize="18" fontWeight="700" paintOrder="stroke" stroke="#09090b" strokeWidth="5">{annotation.label || annotation.name}</text>}
                </g>
              );
            }

            const x = coordinate(annotation.x);
            const y = coordinate(annotation.y);
            const color = annotation.direction === "buy" ? "#22c55e" : "#ef4444";
            const arrowY = annotation.direction === "buy" ? y + 58 : y - 58;
            const tipY = annotation.direction === "buy" ? y : y;
            const wingY = annotation.direction === "buy" ? y + 16 : y - 16;
            return (
              <g key={`entry-${index}`}>
                <line x1={x} y1={arrowY} x2={x} y2={tipY} stroke={color} strokeWidth="7" />
                <polygon points={`${x},${tipY} ${x - 15},${wingY} ${x + 15},${wingY}`} fill={color} />
                <rect x={coordinate(x + 18)} y={coordinate(y - 20)} width="145" height="28" rx="6" fill="#09090b" fillOpacity="0.9" />
                <text x={coordinate(x + 28)} y={coordinate(y)} fill={color} fontSize="19" fontWeight="800">{annotation.label}</text>
              </g>
            );
          })}

          <g>
            <rect x="12" y="12" width="300" height="128" rx="10" fill="#09090b" fillOpacity="0.92" stroke="#71717a" strokeWidth="2" />
            <text x="28" y="40" fill="#fafafa" fontSize="21" fontWeight="800">Risk / Reward</text>
            <text x="28" y="66" fill="#d4d4d8" fontSize="17">Balance: {riskReward.balance}</text>
            <text x="28" y="89" fill="#d4d4d8" fontSize="17">Risk: {riskReward.risk}</text>
            <text x="28" y="112" fill="#d4d4d8" fontSize="17">Lot Size: {riskReward.lotSize}</text>
            <text x="28" y="133" fill="#d4d4d8" fontSize="17">R:R: {riskReward.riskReward}</text>
          </g>

          <g>
            <rect x="710" y="12" width="278" height="48" rx="9" fill="#09090b" fillOpacity="0.92" stroke={verdictColor} strokeWidth="3" />
            <text x="728" y="43" fill={verdictColor} fontSize="21" fontWeight="900">{verdict}</text>
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">Chart levels are visual estimates; verify prices against your exchange.</p>
        <button type="button" onClick={downloadImage} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800">
          Download marked chart
        </button>
      </div>
    </div>
  );
}