"use client";

import { motion } from "motion/react";

const frames = [0, 1, 2, 3, 4, 5];

export function FrameByFrameDemo() {
  return (
    <div className="h-16 flex items-center justify-center gap-1">
      {frames.map((i) => (
        <motion.div
          key={i}
          className="relative flex items-center justify-center size-8 rounded border text-[9px] font-mono"
          initial={{ borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.15)" }}
          animate={{
            borderColor: [
              "rgba(255,255,255,0.06)",
              "var(--brand-accent)",
              "rgba(255,255,255,0.12)",
            ],
            color: ["rgba(255,255,255,0.15)", "var(--brand-accent)", "rgba(255,255,255,0.4)"],
            backgroundColor: [
              "rgba(255,255,255,0)",
              "rgba(176,117,235,0.08)",
              "rgba(176,117,235,0.03)",
            ],
          }}
          transition={{
            duration: 1.2,
            delay: i * 0.4,
            repeat: Infinity,
            repeatDelay: frames.length * 0.4,
            ease: "easeOut",
          }}
        >
          {i}
        </motion.div>
      ))}
    </div>
  );
}
