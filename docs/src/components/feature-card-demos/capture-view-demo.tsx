"use client";

import { motion } from "motion/react";

export function CaptureViewDemo() {
  return (
    <div className="h-20 flex items-center">
      {/* App screen container */}
      <div className="w-[65%] h-full rounded-lg border border-white/[0.08] bg-white/[0.02] p-1.5 flex flex-col gap-1.5">
        {/* Header bar (short) */}
        <div className="h-2.5 rounded-[3px] border border-white/[0.06] bg-white/[0.02]" />

        {/* Recorded view (fills remaining space) */}
        <motion.div
          className="flex-1 rounded-[3px] relative"
          style={{ borderWidth: 1.5, borderStyle: "solid", borderColor: "var(--brand-accent)" }}
          animate={{
            borderColor: ["rgba(176,117,235,0.5)", "rgba(176,117,235,1)", "rgba(176,117,235,0.5)"],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* REC indicator */}
          <div className="absolute top-0.5 right-1 flex items-center gap-0.5">
            <motion.div
              className="size-1 rounded-full bg-red-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="text-[6px] font-mono font-bold text-red-500/80">REC</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
