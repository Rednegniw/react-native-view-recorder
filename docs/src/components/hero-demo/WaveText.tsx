import { motion } from "motion/react";
import React from "react";
import { SkipAnimationContext } from "./context";

export function WaveText({ text, delay = 0.5 }: { text: string; delay?: number }) {
  const skip = React.useContext(SkipAnimationContext);
  const chars = text.split("");
  const total = chars.length;

  return (
    <span className="inline-flex flex-wrap">
      {chars.map((char, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block whitespace-pre text-[18px]"
          initial={
            skip
              ? { y: 0, opacity: 1, filter: "blur(0px)" }
              : { y: 10, opacity: 0, filter: "blur(6px)" }
          }
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          transition={
            skip
              ? { duration: 0 }
              : {
                  type: "spring",
                  stiffness: 120,
                  damping: 14,
                  delay: delay + Math.sin((i / total) * Math.PI) * 0.15 + i * 0.02,
                }
          }
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}
