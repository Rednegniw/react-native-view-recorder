import type { ComponentType } from "react";

export interface DemoEntry {
  key: string;
  title: string;
  description: string;
  Component: ComponentType;
  fullscreen?: boolean;
}

export interface DemoSection {
  title: string;
  data: DemoEntry[];
}

export const DEMO_SECTIONS: DemoSection[] = [
  {
    title: "Showcase",
    data: [
      {
        key: "autoplay-standard",
        title: "Standard Recording (Autoplay)",
        description:
          "Autoplaying demo for screen recording. Shows a gradient countdown being recorded.",
        fullscreen: true,
        get Component() {
          return require("../demos/AutoplayStandardDemo").AutoplayStandardDemo;
        },
      },
      {
        key: "autoplay-skia",
        title: "Skia Recording (Autoplay)",
        description:
          "Autoplaying demo for screen recording. Shows a Skia canvas animation being recorded.",
        fullscreen: true,
        get Component() {
          return require("../demos/AutoplaySkiaDemo").AutoplaySkiaDemo;
        },
      },
    ],
  },
  {
    title: "Recording",
    data: [
      {
        key: "standard",
        title: "Standard Recording",
        description: "Record a countdown timer with NumberFlow animations and encode to MP4.",
        get Component() {
          return require("../demos/StandardRecordingDemo").StandardRecordingDemo;
        },
      },
      {
        key: "skia-canvas",
        title: "Skia Canvas",
        description: "Record an animated Skia canvas with rotating shapes and gradient fills.",
        get Component() {
          return require("../demos/SkiaCanvasDemo").SkiaCanvasDemo;
        },
      },
    ],
  },
  {
    title: "Comparisons",
    data: [
      {
        key: "codec-comparison",
        title: "Codec Comparison",
        description:
          "Record identical content with H.264 and HEVC. Compare file sizes side by side.",
        get Component() {
          return require("../demos/CodecComparisonDemo").CodecComparisonDemo;
        },
      },
      {
        key: "bitrate-comparison",
        title: "Bitrate Comparison",
        description:
          "Record identical content at different bitrates. See the size vs quality tradeoff.",
        get Component() {
          return require("../demos/BitrateComparisonDemo").BitrateComparisonDemo;
        },
      },
    ],
  },
  {
    title: "Edge Cases",
    data: [
      {
        key: "view-resize",
        title: "View Resize Mid-Session",
        description:
          "Start recording, then resize the view partway through to test encoder handling.",
        get Component() {
          return require("../demos/ViewResizeDemo").ViewResizeDemo;
        },
      },
    ],
  },
];

export function findDemoEntry(key: string): DemoEntry | undefined {
  for (const section of DEMO_SECTIONS) {
    const entry = section.data.find((d) => d.key === key);
    if (entry) return entry;
  }
  return undefined;
}
