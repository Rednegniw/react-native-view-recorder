import { motion } from "motion/react";
import React from "react";
import { EASE_SMOOTH, SkipAnimationContext } from "./context";

export function RippleButton({
  children,
  className,
  style,
  delay,
  onPress,
  buttonRef,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  onPress?: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const skip = React.useContext(SkipAnimationContext);
  const [ripples, setRipples] = React.useState<{ x: number; y: number; id: number }[]>([]);

  function triggerRipple(x: number, y: number) {
    const id = Date.now();
    setRipples((prev) => [...prev, { x, y, id }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    triggerRipple(e.clientX - rect.left, e.clientY - rect.top);
    onPress?.();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: triggerRipple is stable
  React.useImperativeHandle(buttonRef, () => {
    const el = document.querySelector("[data-share-btn]") as HTMLButtonElement;
    if (el) {
      (el as HTMLButtonElement & { triggerRipple: typeof triggerRipple }).triggerRipple =
        triggerRipple;
    }
    return el;
  }, []);

  const finalState = { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <motion.button
      data-share-btn
      className={`relative overflow-hidden ${className}`}
      style={style}
      onClick={handleClick}
      ref={buttonRef}
      initial={skip ? finalState : { opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={finalState}
      transition={skip ? { duration: 0 } : { duration: 0.5, delay, ease: EASE_SMOOTH }}
      whileTap={{ scale: 0.97 }}
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none animate-ripple"
          style={{
            left: ripple.x - 50,
            top: ripple.y - 50,
            width: 100,
            height: 100,
            background: "rgba(255, 255, 255, 0.3)",
          }}
        />
      ))}
      {children}
    </motion.button>
  );
}
