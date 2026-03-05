import { motion } from "motion/react";
import React from "react";
import { EASE_SMOOTH, inter, SkipAnimationContext } from "./context";

export function StatRow({
  delay,
  icon,
  title,
  subtitle,
}: {
  delay: number;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const skip = React.useContext(SkipAnimationContext);
  const finalState = { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <motion.div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      initial={skip ? finalState : { opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={finalState}
      transition={skip ? { duration: 0 } : { duration: 0.5, delay, ease: EASE_SMOOTH }}
      style={{ background: "rgba(0, 0, 0, 0.25)" }}
    >
      <div className="shrink-0 w-9 h-9 rounded-lg overflow-hidden">{icon}</div>
      <div className="flex flex-col gap-1">
        <span className="text-white/90 text-sm font-semibold leading-tight">{title}</span>
        {subtitle && (
          <span className={`text-white/50 text-[10px] leading-tight ${inter.className}`}>
            {subtitle}
          </span>
        )}
      </div>
    </motion.div>
  );
}
