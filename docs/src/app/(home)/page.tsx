"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Logo } from "@/components/logo";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "react-native-view-recorder",
  description:
    "Record any React Native view to MP4 video with hardware-accelerated H.264/HEVC encoding. No FFmpeg, no GPL.",
  codeRepository: "https://github.com/Rednegniw/react-native-view-recorder",
  programmingLanguage: ["TypeScript"],
  runtimePlatform: ["iOS", "Android"],
  license: "https://opensource.org/licenses/MIT",
  author: {
    "@type": "Person",
    name: "Antonin Wingender",
    url: "https://github.com/Rednegniw",
  },
  url: "https://react-native-view-recorder.awingender.com",
  isAccessibleForFree: true,
};

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
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Subtle accent gradient glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 85% 15%, rgba(176,117,235,0.04) 0%, transparent 50%)",
        }}
      />

      {/* Hero: two-column on desktop, stacked on mobile */}
      <section className="flex flex-col lg:flex-row items-center gap-16 lg:gap-28 max-w-5xl">
        {/* Phone mockup placeholder */}
        <div className="flex-shrink-0 w-64 h-[520px] rounded-[3rem] border-2 border-fd-border bg-fd-muted/30 flex items-center justify-center">
          <span className="text-fd-muted-foreground text-sm">Video coming soon</span>
        </div>

        {/* Content */}
        <motion.div
          className="flex flex-col gap-8 lg:items-start lg:text-left items-center text-center"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {/* Logo + title */}
          <motion.div className="flex items-center gap-3 sm:gap-4" variants={item}>
            <Logo className="size-9 sm:size-11 text-fd-primary" />
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
              React Native <span className="text-fd-primary">View Recorder</span>
            </h1>
          </motion.div>

          {/* Description */}
          <motion.p className="text-lg text-fd-muted-foreground max-w-lg" variants={item}>
            Record any React Native view to MP4 video. Hardware-accelerated H.264/HEVC encoding with
            zero third-party binaries.
          </motion.p>

          {/* CTA buttons */}
          <motion.div className="flex flex-row gap-3" variants={item}>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full bg-fd-primary px-7 py-3 text-base font-medium text-fd-primary-foreground hover:bg-fd-primary/90 transition-colors"
            >
              Documentation
            </Link>
            <a
              href="https://github.com/Rednegniw/react-native-view-recorder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border px-7 py-3 text-base font-medium hover:bg-fd-accent transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-label="GitHub"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </a>
          </motion.div>
        </motion.div>
      </section>
    </main>
  );
}
