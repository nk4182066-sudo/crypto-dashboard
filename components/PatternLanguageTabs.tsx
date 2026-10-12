"use client";

// PatternLibrary language toggle — [Roman Urdu] [English] tabs shown at the
// top-right of every pattern detail card. Preference is shared across the
// candlestick and chart-pattern detail pages via localStorage. Educational only.

export type PatternDetailLanguage = "urdu" | "english";

interface PatternLanguageTabsProps {
  value: PatternDetailLanguage;
  onChange: (next: PatternDetailLanguage) => void;
}

export default function PatternLanguageTabs({ value, onChange }: PatternLanguageTabsProps) {
  const tab = (key: PatternDetailLanguage, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={value === key}
      className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
      style={
        value === key
          ? { backgroundColor: "#00C087", color: "#0B0E11" }
          : { color: "#9CA3AF", backgroundColor: "transparent" }
      }
    >
      {label}
    </button>
  );

  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-full border p-1"
      style={{ backgroundColor: "#181A20", borderColor: "#2B3139" }}
      aria-label="Content language"
    >
      {tab("urdu", "Roman Urdu")}
      {tab("english", "English")}
    </div>
  );
}
