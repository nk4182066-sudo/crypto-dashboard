"use client";

// Part 1 — 3-panel cinematic onboarding story (~6 sec, 2s per panel).
// Framer-motion: per-panel motion (shake / zoom+sparkle / bounce+confetti),
// typewriter text, floating + golden particles, animated progress bar,
// glowing pulsing countdown dots, Skip button. Educational only.
import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

type Accent = "red" | "blue" | "green";

interface Panel {
  image: string;
  title: string;
  subtitle: string;
  bg: string;
  accent: Accent;
  glow: string;
  /** Image enter animation per panel. */
  imageAnim: "shake" | "zoom" | "bounce";
}

const panels: Panel[] = [
  {
    image: "/story/panel-1.png",
    title: "Trading mein loss? Confusion?",
    subtitle: "Har baar ghalat direction? Aise hota hai jab AI nahi hoti.",
    bg: "from-red-950 via-red-900 to-black",
    accent: "red",
    glow: "bg-red-500",
    imageAnim: "shake",
  },
  {
    image: "/story/panel-2.png",
    title: "AI Trading Bot — Sahi direction",
    subtitle: "Robot aapko sahi rasta dikhata hai. Emotion nahi, sirf data.",
    bg: "from-blue-950 via-purple-900 to-black",
    accent: "blue",
    glow: "bg-blue-500",
    imageAnim: "zoom",
  },
  {
    image: "/story/panel-3.png",
    title: "Trading Student Expert AI",
    subtitle: "100% Free for everyone",
    bg: "from-green-950 via-emerald-900 to-black",
    accent: "green",
    glow: "bg-emerald-500",
    imageAnim: "bounce",
  },
];

/** Per-panel hold time (ms). 3 panels * 2s ≈ 6 sec total. */
const PANEL_MS = 2000;

/** Accent color for particles / dots / bar per panel. */
const ACCENT_HEX: Record<Accent, string> = {
  red: "#f6465d",
  blue: "#60a5fa",
  green: "#34d399",
};

/** Typewriter: reveals `text` one character at a time. Mount keyed by index so
 *  each panel restarts the effect (the dependency is `text`). */
function useTypewriter(text: string, speed = 45, startDelay = 300): string {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    const startTimer = setTimeout(() => {
      const id = setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) clearInterval(id);
      }, speed);
    }, startDelay);
    return () => clearTimeout(startTimer);
  }, [text, speed, startDelay]);
  return shown;
}

/** Typewriter heading — remounts per panel (keyed by index) so it restarts. */
function PanelTitle({ text }: { text: string }) {
  const typed = useTypewriter(text, 45, 300);
  return (
    <h1 className="min-h-[3.5rem] text-center text-3xl font-bold text-white drop-shadow-2xl md:text-5xl">
      {typed}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        className="ml-1"
      >
        |
      </motion.span>
    </h1>
  );
}


export default function WelcomeStory({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const panel = panels[index];

  // Auto-advance: 2s per panel, then complete on the last one.
  useEffect(() => {
    const isLast = index >= panels.length - 1;
    const timer = setTimeout(isLast ? onComplete : () => setIndex(index + 1), PANEL_MS);
    return () => clearTimeout(timer);
  }, [index, onComplete]);

  const accent = ACCENT_HEX[panel.accent];
  const isHero = panel.imageAnim === "zoom";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${panel.bg} transition-all duration-1000`} />

      {/* Red pulsing overlay on the "pain" panel */}
      {panel.accent === "red" && (
        <motion.div
          className="absolute inset-0 bg-red-600"
          animate={{ opacity: [0, 0.12, 0] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}

      {/* Floating particles — golden on the hero panel */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 22 }).map((_, i) => (
          <motion.div
            key={`p-${i}`}
            className="absolute h-1 w-1 rounded-full"
            style={{ backgroundColor: isHero && i % 3 === 0 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}
            initial={{ left: `${(i * 17 + 7) % 100}%`, top: "100%", opacity: 0 }}
            animate={{ top: "-10%", opacity: [0, 1, 0] }}
            transition={{ duration: 3 + (i % 5) * 0.4, repeat: Infinity, delay: (i % 7) * 0.3 }}
          />
        ))}
      </div>

      {/* Progress bar top */}
      <div className="absolute left-0 right-0 top-0 z-10 h-1 bg-black/30">
        <motion.div
          className="h-full"
          style={{ backgroundColor: accent }}
          initial={{ width: "0%" }}
          animate={{ width: `${((index + 1) / panels.length) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Skip button top-right */}
      <button
        type="button"
        onClick={onComplete}
        className="absolute right-6 top-6 z-20 rounded-full border border-zinc-600 bg-black/20 px-4 py-2 text-sm text-zinc-300 backdrop-blur-sm transition-all hover:border-white hover:text-white"
      >
        Skip Story →
      </button>

      {/* Main content */}
      <div className="relative flex h-full items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -40 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex max-w-2xl flex-col items-center gap-7"
          >
            {/* Image — animation differs per panel */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className={`absolute inset-0 blur-3xl opacity-50 ${panel.glow}`} />

              {/* Panel 1: shake + fade */}
              {panel.imageAnim === "shake" && (
                <motion.div
                  animate={{ x: [0, -10, 10, -8, 8, 0] }}
                  transition={{ duration: 0.7, delay: 0.3, repeat: 1 }}
                  className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
                >
                  <StoryImage src={panel.image} alt={panel.title} />
                </motion.div>
              )}


              {/* Panel 2: robot zoom + golden sparkle ring */}
              {panel.imageAnim === "zoom" && (
                <div className="relative">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <motion.span
                      key={`s-${i}`}
                      className="absolute h-1.5 w-1.5 rounded-full bg-amber-300"
                      style={{ left: "50%", top: "50%" }}
                      animate={{
                        x: Math.cos((i / 8) * Math.PI * 2) * 130,
                        y: Math.sin((i / 8) * Math.PI * 2) * 130,
                        opacity: [0, 1, 0],
                        scale: [0.5, 1.4, 0.5],
                      }}
                      transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.12 }}
                    />
                  ))}
                  <motion.div
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.8, type: "spring", stiffness: 120 }}
                    className="relative overflow-hidden rounded-3xl border border-amber-300/30 shadow-2xl"
                  >
                    <StoryImage src={panel.image} alt={panel.title} />
                  </motion.div>
                </div>
              )}

              {/* Panel 3: bounce + confetti */}
              {panel.imageAnim === "bounce" && (
                <div className="relative">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <motion.span
                      key={`c-${i}`}
                      className="absolute left-1/2 top-0 h-2 w-2 rounded-sm"
                      style={{
                        backgroundColor: ["#34d399", "#fbbf24", "#60a5fa", "#f472b6"][i % 4],
                      }}
                      initial={{ x: 0, y: -10, opacity: 1, rotate: 0 }}
                      animate={{
                        x: (i % 2 === 0 ? 1 : -1) * (40 + (i % 5) * 30),
                        y: 120 + (i % 4) * 25,
                        opacity: [1, 1, 0],
                        rotate: 180,
                      }}
                      transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.08 }}
                    />
                  ))}
                  <motion.div
                    animate={{ y: [0, -16, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                    className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
                  >
                    <StoryImage src={panel.image} alt={panel.title} />
                  </motion.div>
                </div>
              )}
            </motion.div>

            {/* Typewriter title — keyed by index so it restarts each panel */}
            <PanelTitle key={index} text={panel.title} />

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className={`max-w-md text-center text-lg md:text-xl ${
                panel.accent === "blue" ? "font-bold text-amber-300" : "text-zinc-300"
              }`}
            >
              {panel.subtitle}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Glowing pulsing countdown dots */}
      <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-4">
        {panels.map((p, i) => (
          <motion.div
            key={p.title}
            className="h-3 w-3 rounded-full"
            animate={
              i === index
                ? { scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }
                : { scale: 1, opacity: 0.35 }
            }
            transition={i === index ? { duration: 1.2, repeat: Infinity } : { duration: 0.3 }}
            style={{
              backgroundColor: i === index ? ACCENT_HEX[p.accent] : "#71717a",
              boxShadow: i === index ? `0 0 12px ${ACCENT_HEX[p.accent]}` : "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Panel image with a subtle rotate/scale on enter. */
function StoryImage({ src, alt }: { src: string; alt: string }) {
  return (
    <motion.div
      initial={{ scale: 1, rotate: -1 }}
      animate={{ scale: 1.06, rotate: 0.5 }}
      transition={{ duration: PANEL_MS / 1000, ease: "easeOut" }}
    >
      <Image
        src={src}
        alt={alt}
        width={500}
        height={375}
        priority
        className="h-auto w-full max-w-[80vw] rounded-3xl object-cover"
      />
    </motion.div>
  );
}
