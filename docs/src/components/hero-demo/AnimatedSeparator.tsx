import { motion } from "motion/react";
import React from "react";
import { EASE_SMOOTH, SkipAnimationContext } from "./context";

export function AnimatedSeparator({ delay, className }: { delay: number; className?: string }) {
  const skip = React.useContext(SkipAnimationContext);
  const finalState = { opacity: 1, scaleX: 1 };
  return (
    <motion.div
      className={`h-px w-full bg-white/10 ${className ?? ""}`}
      initial={skip ? finalState : { opacity: 0, scaleX: 0 }}
      animate={finalState}
      transition={skip ? { duration: 0 } : { duration: 0.5, delay, ease: EASE_SMOOTH }}
    />
  );
}
