"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const BALL_R = 7;
const GRAVITY = 0.12;
const BOUNCE_VY = -3.2;

export function SkiaDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 20, y: 10 });
  const state = useRef({ x: 20, y: 10, vx: 1.2, vy: 0 });
  const rafId = useRef(0);

  const tick = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const s = state.current;
    const w = el.clientWidth - BALL_R * 2;
    const h = el.clientHeight - BALL_R * 2;

    s.vy += GRAVITY;
    s.x += s.vx;
    s.y += s.vy;

    // Side walls
    if (s.x <= 0) {
      s.x = 0;
      s.vx = Math.abs(s.vx);
    } else if (s.x >= w) {
      s.x = w;
      s.vx = -Math.abs(s.vx);
    }

    // Ceiling
    if (s.y <= 0) {
      s.y = 0;
      s.vy = Math.abs(s.vy);
    }

    // Floor: gain energy back so it keeps bouncing
    if (s.y >= h) {
      s.y = h;
      s.vy = BOUNCE_VY;
    }

    setPos({ x: s.x, y: s.y });
    rafId.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [tick]);

  return (
    <div className="h-20 flex items-center">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative w-[65%] h-full rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden"
      >
        {/* Bouncing ball */}
        <div
          className="absolute rounded-full"
          style={{
            width: BALL_R * 2,
            height: BALL_R * 2,
            background: "var(--brand-accent)",
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            willChange: "transform",
          }}
        />

        {/* REC indicator */}
        <div className="absolute -top-1.5 left-1.5 flex items-center gap-1">
          <motion.div
            className="size-1.5 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-[7px] font-mono font-bold text-red-500/80">REC</span>
        </div>
      </div>
    </div>
  );
}
