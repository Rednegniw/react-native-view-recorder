"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import React from "react";
import { AnimatedSeparator } from "./AnimatedSeparator";
import { EASE_SMOOTH, inter, SkipAnimationContext, zenOldMincho } from "./context";
import { RecordingOverlay } from "./RecordingOverlay";
import { RippleButton } from "./RippleButton";
import { StatRow } from "./StatRow";
import { WaveText } from "./WaveText";
import { WavyBackground } from "./WavyBackground";
import { YearScore } from "./YearScore";

const HEADING = "Your year in review";

const STATS = [
  {
    delay: 1.2,
    icon: "/stat-beer.png",
    alt: "Beer",
    title: "You drank ~17 beers weekly.",
    subtitle: "That's higher than 92% of users on our platform.",
  },
  {
    delay: 1.35,
    icon: "/stat-back.png",
    alt: "Back pain",
    title: "Back hurts in 2 new places.",
    subtitle: "Happy birthday!",
  },
  {
    delay: 1.5,
    icon: "/stat-screentime.png",
    alt: "Screen time",
    title: "Your screen time is higher than 85% of users.",
  },
  {
    delay: 1.65,
    icon: "/stat-hobby.png",
    alt: "Hiking",
    title: "Started 7 new hobbies.",
    subtitle: "We are still calculating the retention rate.",
  },
  {
    delay: 1.8,
    icon: "/stat-money.png",
    alt: "Money",
    title: "Salary rose 2% this year.",
    subtitle: "That's about the median increase for your industry. Congrats!",
  },
];

export function HeroDemo() {
  const [isIdle, setIsIdle] = React.useState(true);
  const [isRecording, setIsRecording] = React.useState(false);
  const [showOverlay, setShowOverlay] = React.useState(false);
  const [showSaveButton, setShowSaveButton] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [overlayRect, setOverlayRect] = React.useState<DOMRect | null>(null);
  const [animationKey, setAnimationKey] = React.useState(0);
  const shareButtonRef = React.useRef<HTMLButtonElement>(null);
  const contentCardRef = React.useRef<HTMLDivElement>(null);

  // Auto-trigger share after 2.5s (runs on every loop)
  // biome-ignore lint/correctness/useExhaustiveDependencies: animationKey intentionally restarts the loop
  React.useEffect(() => {
    if (showOverlay || isRecording) return;
    const timeout = setTimeout(() => {
      const btn = document.querySelector("[data-share-btn]") as HTMLButtonElement | null;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const rippleFn = (
          btn as HTMLButtonElement & { triggerRipple?: (x: number, y: number) => void }
        ).triggerRipple;
        if (rippleFn) rippleFn(rect.width / 2, rect.height / 2);
      }
      setTimeout(() => {
        setIsIdle(false);
        setIsRecording(true);
        setAnimationKey((k) => k + 1);
      }, 300);
    }, 2500);
    return () => clearTimeout(timeout);
  }, [animationKey, showOverlay, isRecording]);

  // After recording plays for ~5s, fade out border/REC and show overlay
  // biome-ignore lint/correctness/useExhaustiveDependencies: animationKey intentionally restarts the timer
  React.useEffect(() => {
    if (!isRecording) return;
    const timeout = setTimeout(() => {
      if (contentCardRef.current) setOverlayRect(contentCardRef.current.getBoundingClientRect());
      setIsRecording(false);
      setTimeout(() => setShowOverlay(true), 400);
    }, 5500);
    return () => clearTimeout(timeout);
  }, [isRecording, animationKey]);

  // After overlay appears, show Save button and auto-click
  React.useEffect(() => {
    if (!showOverlay) return;
    const showBtn = setTimeout(() => setShowSaveButton(true), 1500);
    const autoClick = setTimeout(() => setIsSaving(true), 3500);
    return () => {
      clearTimeout(showBtn);
      clearTimeout(autoClick);
    };
  }, [showOverlay]);

  // After suck-in completes, reset for the loop
  React.useEffect(() => {
    if (!isSaving) return;
    const timeout = setTimeout(() => {
      setShowOverlay(false);
      setShowSaveButton(false);
      setIsSaving(false);
      setOverlayRect(null);
      setTimeout(() => {
        setIsIdle(true);
        setAnimationKey((k) => k + 1);
      }, 1000);
    }, 600);
    return () => clearTimeout(timeout);
  }, [isSaving]);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: "#1a0a0a" }}>
      <WavyBackground />

      {/* REC indicator */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            className="absolute z-20 flex items-center gap-1.5"
            style={{ top: 52, left: 28 }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.3, ease: EASE_SMOOTH }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#DC3437] animate-rec-pulse" />
            <span className={`text-[#DC3437] text-xs font-bold tracking-wider ${inter.className}`}>
              REC
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content card */}
      <motion.div
        ref={contentCardRef}
        className="absolute z-10 rounded-2xl overflow-hidden"
        initial={{ left: 24, right: 24, top: 56, bottom: 40 }}
        animate={
          isRecording
            ? { left: 24, right: 24, top: 72, bottom: 56 }
            : { left: 24, right: 24, top: 56, bottom: 40 }
        }
        transition={{ duration: 0.6, ease: EASE_SMOOTH }}
        style={{
          background: "linear-gradient(160deg, rgba(55, 18, 18, 0.55), rgba(35, 12, 22, 0.5))",
          backdropFilter: "brightness(110%) saturate(130%) blur(4px)",
          WebkitBackdropFilter: "brightness(110%) saturate(130%) blur(4px)",
          boxShadow:
            "inset 0 1px 1px rgba(255, 180, 140, 0.15), inset 0 -1px 4px rgba(0, 0, 0, 0.2), 0 4px 16px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Gradient border */}
        <motion.div
          data-border-overlay
          className="absolute inset-0 rounded-2xl pointer-events-none z-30"
          animate={{ opacity: isRecording ? 0 : 1 }}
          transition={{ duration: 0.4 }}
          style={{
            padding: "1px",
            background:
              "linear-gradient(180deg, rgba(255, 140, 100, 0.2), rgba(255, 140, 100, 0.03))",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
          }}
        />

        {/* Red recording border */}
        <motion.div
          data-border-overlay
          className="absolute inset-0 rounded-2xl pointer-events-none z-30"
          animate={{ opacity: isRecording ? 1 : 0 }}
          transition={{ duration: 0.4 }}
          style={{
            padding: "2px",
            background: "#DC3437",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
          }}
        />

        {/* Noise grain */}
        <svg
          role="none"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]"
        >
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>

        {/* Card content */}
        <SkipAnimationContext.Provider value={isIdle}>
          <div
            key={animationKey}
            className={`relative px-4 pt-5 pb-4 flex flex-col gap-2 h-full ${zenOldMincho.className}`}
          >
            <h2 className="text-white text-2xl pl-1.5 font-bold tracking-tight">
              <WaveText text={HEADING} />
            </h2>

            <AnimatedSeparator delay={1.0} className="my-2" />

            {STATS.map((stat) => (
              <StatRow
                key={stat.alt}
                delay={stat.delay}
                icon={
                  <Image
                    src={stat.icon}
                    alt={stat.alt}
                    width={36}
                    height={36}
                    className="object-cover w-full h-full"
                  />
                }
                title={stat.title}
                subtitle={stat.subtitle}
              />
            ))}

            <AnimatedSeparator delay={2.0} className="my-1" />
            <YearScore delay={2.2} />

            <div className="flex-1" />

            {!isRecording && (
              <RippleButton
                delay={4.5}
                buttonRef={shareButtonRef}
                onPress={() => {
                  setIsRecording(true);
                  setAnimationKey((k) => k + 1);
                }}
                className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white ${inter.className}`}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05))",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                <svg
                  role="none"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
                  <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
                </svg>
                Share your year
              </RippleButton>
            )}
          </div>
        </SkipAnimationContext.Provider>
      </motion.div>

      {/* Floating video overlay (portaled outside phone clip-path) */}
      {showOverlay && overlayRect && (
        <RecordingOverlay
          overlayRect={overlayRect}
          isSaving={isSaving}
          showSaveButton={showSaveButton}
          onSave={() => setIsSaving(true)}
        />
      )}
    </div>
  );
}
