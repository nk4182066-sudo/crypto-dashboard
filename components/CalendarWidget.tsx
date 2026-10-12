// Economic calendar from public API. Educational only.

"use client";

import { useCallback, useEffect, useState } from "react";

interface CalendarEvent {
  date: string;
  time: string;
  event_name: string;
  impact: "High" | "Medium" | "Low";
  country: string;
}

interface CalendarResponse {
  events: CalendarEvent[];
}

type ImpactLevel = "High" | "Medium" | "Low";
type Filter = "all" | "high";

const impactStyles: Record<ImpactLevel, string> = {
  High: "bg-red-500/20 text-red-400 border-red-500/30",
  Medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const impactLabel: Record<ImpactLevel, string> = {
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

function getFlag(countryCode: string): string {
  let flag = "";
  for (let i = 0; i < countryCode.length; i++) {
    const codePoint = countryCode.toUpperCase().charCodeAt(i) - 65 + 0x1F1E6;
    flag += String.fromCodePoint(codePoint);
  }
  return flag;
}

export function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
      );
      if (!response.ok) {
        throw new Error("Failed to fetch calendar");
      }
      const data: CalendarResponse = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar();
    const interval = window.setInterval(fetchCalendar, 24 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchCalendar]);

  const filteredEvents = events.filter((event) => {
    if (filter === "all") return true;
    return event.impact === "High";
  });

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-zinc-200">
          📅 Aane Wale Events
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
              filter === "all"
                ? "bg-zinc-700 text-zinc-200"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("high")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
              filter === "high"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            High
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm mb-4">
          ⚠️ Error: {error}
        </div>
      )}

      <div className="space-y-3">
        {filteredEvents.slice(0, 10).map((event, index) => (
          <div
            key={index}
            className="p-3 rounded-lg hover:bg-zinc-800/50 border border-zinc-700/30 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">
                {event.date} • {event.time}
              </span>
              <span
                className={`text-xs font-semibold ${impactStyles[event.impact]}`}
              >
                {impactLabel[event.impact]}
              </span>
            </div>
            <p className="text-sm text-zinc-200 mt-1">{event.event_name}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {getFlag(event.country)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
