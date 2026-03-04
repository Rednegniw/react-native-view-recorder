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

export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-4 py-16 gap-12">
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

      {/* Hero */}
      <section className="flex flex-col items-center gap-8 max-w-2xl text-center">
        {/* Title */}
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2 sm:gap-4">
            <Logo className="size-8 sm:size-12 text-fd-primary" />
            <h1 className="text-2xl sm:text-5xl font-bold tracking-tight">
              React Native View Recorder
            </h1>
          </div>
          <p className="text-lg text-fd-muted-foreground max-w-lg">
            Record any React Native view to MP4 video. Hardware-accelerated H.264/HEVC encoding with
            zero third-party binaries. No FFmpeg, no GPL.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-fd-muted-foreground">
          <div className="rounded-lg border border-fd-border p-4">
            <p className="font-medium text-fd-foreground mb-1">View-level capture</p>
            <p>Record specific views, not the entire screen</p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <p className="font-medium text-fd-foreground mb-1">Works with Skia</p>
            <p>Captures Skia canvases and TextureViews</p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <p className="font-medium text-fd-foreground mb-1">Tiny footprint</p>
            <p>~90 KB native code, zero third-party binaries</p>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-row gap-3">
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
