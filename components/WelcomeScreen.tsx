"use client";

// Part 3 — 2.5 sec premium welcome screen. Shows the welcome art with a green
// glow, sparkle particles and the greeting "Welcome, My New User".
// Educational only. Not financial advice.
import { useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export default function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black">
      {/* Sparkle particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-yellow-300"
          initial={{ left: `${(i * 3.3) % 100}%`, top: `${(i * 6.1) % 100}%`, opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: (i % 10) * 0.2 }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative w-full max-w-3xl px-6"
      >
        {/* Glow behind image */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500/40 via-emerald-500/40 to-green-500/40 blur-3xl" />

        <Image
          src="/story/welcome.png"
          alt="Welcome"
          width={900}
          height={675}
          priority
          className="relative h-auto w-full rounded-3xl border border-white/10 shadow-2xl"
        />

        {/* Welcome text overlaid on the image */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.h1
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.8, type: "spring" }}
            className="px-4 text-center text-3xl font-bold text-white drop-shadow-2xl md:text-5xl lg:text-6xl"
            style={{ textShadow: "0 0 30px rgba(0,200,135,0.8), 0 0 60px rgba(0,200,135,0.4)" }}
          >
            Welcome, My New User 🎉
          </motion.h1>
        </div>
      </motion.div>

      {/* Loading dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-20 flex gap-2"
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-green-400"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </motion.div>
    </div>
  );
}
