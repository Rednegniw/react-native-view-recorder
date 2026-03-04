"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AudioDemo } from "./feature-card-demos/audio-demo";
import { CaptureViewDemo } from "./feature-card-demos/capture-view-demo";
import { FrameByFrameDemo } from "./feature-card-demos/frame-by-frame-demo";
import { SkiaDemo } from "./feature-card-demos/skia-demo";

type Feature = {
  title: string;
  description: string;
  demo: ReactNode;
};

const features: Feature[] = [
  {
    demo: <CaptureViewDemo />,
    title: "Capture any View",
    description:
      "Record a specific view to MP4, not the entire screen. Wrap content in RecordingView and call record().",
  },
  {
    demo: <SkiaDemo />,
    title: "Skia Views Too",
    description:
      "Zero-copy Metal capture for Skia canvases on iOS. PixelCopy for all view types on Android.",
  },
  {
    demo: <FrameByFrameDemo />,
    title: "Frame-by-Frame Control",
    description:
      "Async onFrame callback lets you update content between each capture. Drive animations programmatically.",
  },
  {
    demo: <AudioDemo />,
    title: "Supports Audio",
    description: "Add your own audio file, or mix audio programmatically.",
  },
];

const container = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export function FeatureCards() {
  return (
    <motion.div
      className="not-prose grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl"
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      {features.map((feature) => (
        <motion.div
          key={feature.title}
          variants={item}
          className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#b075eb]/[0.02] to-white/[0.01] p-6 transition-colors duration-300 hover:border-white/[0.12]"
        >
          {/* Top-edge highlight shimmer */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/[0.08] to-transparent" />

          {/* Animated demo */}
          <div className="mb-3">{feature.demo}</div>

          <h3 className="text-[15px] font-semibold tracking-tight text-fd-foreground">
            {feature.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fd-muted-foreground">
            {feature.description}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}
