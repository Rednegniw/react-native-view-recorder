"use client";

import type { SandpackTheme } from "@codesandbox/sandpack-react";
import { SandpackCodeViewer, SandpackProvider } from "@codesandbox/sandpack-react";
import { nightOwl } from "@codesandbox/sandpack-themes";
import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { PhoneMockup } from "./PhoneMockup";

const darkTheme: SandpackTheme = {
  ...nightOwl,
  colors: {
    ...nightOwl.colors,
    surface1: "#0a0a0a",
    surface2: "#1a1a1a",
    surface3: "#111111",
  },
};

const DISCLAIMER =
  "React Native components require native rendering and cannot run in browser sandboxes. This recording was captured from the example app running on a device.";

interface VideoExampleContentProps {
  code: string;
  src: string;
}

export function VideoExampleContent({ code, src }: VideoExampleContentProps) {
  const decodedCode = decodeURIComponent(code);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  return (
    <div className="my-6">
      <SandpackProvider
        template="vite-react"
        theme={darkTheme}
        files={{
          "/App.tsx": decodedCode,
          "/App.jsx": { code: "", hidden: true },
        }}
        options={{ activeFile: "/App.tsx" }}
      >
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Code viewer (read-only) */}
          <div
            className="flex-1 min-w-0 overflow-hidden rounded-xl border border-fd-border [&>div]:h-full"
            style={{ height: 560 }}
          >
            <SandpackCodeViewer showLineNumbers decorators={[{ line: 1, className: "" }]} />
          </div>

          {/* Phone preview with video */}
          <div
            className="shrink-0 flex justify-center"
            style={{ height: 560, position: "relative" }}
          >
            <PhoneMockup>
              <video
                ref={videoRef}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              >
                <source src={src} type="video/mp4" />
              </video>
            </PhoneMockup>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute video" : "Mute video"}
              style={{
                position: "absolute",
                right: 16,
                bottom: 16,
                zIndex: 20,
                width: 34,
                height: 34,
                borderRadius: 17,
                border: "1px solid rgba(255,255,255,0.22)",
                backgroundColor: "rgba(0,0,0,0.58)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </div>
      </SandpackProvider>

      <p className="text-xs text-fd-muted-foreground mt-3 text-center italic">{DISCLAIMER}</p>
    </div>
  );
}
