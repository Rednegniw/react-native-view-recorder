import { motion } from "motion/react";
import React from "react";
import { EASE_SMOOTH, SkipAnimationContext } from "./context";

export function YearScore({ delay = 2.2 }: { delay?: number }) {
  const skip = React.useContext(SkipAnimationContext);
  const [count, setCount] = React.useState(skip ? 55 : 0);
  const [started, setStarted] = React.useState(skip);
  const [done, setDone] = React.useState(skip);
  const target = 55;
  const duration = 1.8;

  React.useEffect(() => {
    if (skip) return;
    const timeout = setTimeout(() => setStarted(true), delay * 1000);
    return () => clearTimeout(timeout);
  }, [delay, skip]);

  React.useEffect(() => {
    if (!started || skip) return;
    const startTime = performance.now();
    let raf: number;
    function tick(now: number) {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setCount(Math.round(eased * target));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, skip]);

  const finalState = { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <motion.div
      className="flex flex-col items-center gap-1 py-3"
      initial={skip ? finalState : { opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={finalState}
      transition={skip ? { duration: 0 } : { duration: 0.5, delay, ease: EASE_SMOOTH }}
    >
      <span className="text-white/60 text-xs font-medium tracking-wide uppercase">
        Your year score
      </span>
      <span className="text-white text-5xl font-bold tabular-nums">{count}</span>
      <motion.span
        className="text-white/40 text-xs"
        initial={skip ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
        animate={done ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, ease: EASE_SMOOTH }}
      >
        {done ? "Better luck next year!" : "\u00A0"}
      </motion.span>
    </motion.div>
  );
}
