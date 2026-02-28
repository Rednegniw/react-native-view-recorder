import { File, Paths } from "expo-file-system";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 30;
const DURATION_SECONDS = 1.5;
const TOTAL_FRAMES = Math.round(DURATION_SECONDS * FPS);
const WIDTH = 640;
const HEIGHT = 480;

const BITRATE_LEVELS = [
  { label: "Low (200 kbps)", bitrate: 200_000 },
  { label: "Medium (2 Mbps)", bitrate: 2_000_000 },
  { label: "High (8 Mbps)", bitrate: 8_000_000 },
] as const;

const PARTICLE_COUNT = 80;

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

type Phase = "idle" | "recording" | "done" | "error";

interface Result {
  uri: string;
  bitrate: number;
  label: string;
}

export const BitrateComparisonDemo = () => {
  const recorder = useViewRecorder();

  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<Result[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentLevel, setCurrentLevel] = useState("");
  const [frameProgress, setFrameProgress] = useState(0);

  const isRecording = phase === "recording";

  const startComparison = useCallback(async () => {
    setResults([]);
    setErrorMsg(null);
    setPhase("recording");

    const collected: Result[] = [];

    try {
      for (let i = 0; i < BITRATE_LEVELS.length; i++) {
        const level = BITRATE_LEVELS[i];
        setCurrentLevel(level.label);
        setProgress(0);
        setFrameProgress(0);

        const filename = `bitrate_${level.bitrate}.mp4`;
        const outputFile = new File(Paths.cache, filename);
        if (outputFile.exists) outputFile.delete();
        const outputPath = outputFile.uri.replace("file://", "");

        const uri = await recorder.record({
          output: outputPath,
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
          totalFrames: TOTAL_FRAMES,
          bitrate: level.bitrate,
          optimizeForNetwork: true,

          onFrame: async ({ frameIndex, totalFrames }) => {
            setFrameProgress(frameIndex / totalFrames);
          },

          onProgress: ({ framesEncoded, totalFrames }) => {
            setProgress(Math.round((framesEncoded / totalFrames) * 100));
          },
        });

        collected.push({ uri, bitrate: level.bitrate, label: level.label });
      }

      setResults(collected);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [recorder]);

  return (
    <View style={{ gap: 16 }}>
      {/* RecordingView: always mounted, offscreen when not recording.
          Decorative styles on a wrapper so they don't get captured into video frames. */}
      <View
        style={
          isRecording
            ? {
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: colors.recording,
              }
            : { position: "absolute", left: -9999, top: -9999 }
        }
      >
        <RecordingView
          sessionId={recorder.sessionId}
          style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
          pointerEvents={isRecording ? "auto" : "none"}
        >
          <AnimatedContent progress={frameProgress} />
        </RecordingView>
      </View>

      {/* Results */}
      {phase === "done" &&
        results.map((r) => (
          <VideoOverview
            key={r.bitrate}
            uri={r.uri}
            width={WIDTH}
            height={HEIGHT}
            fps={FPS}
            codec="hevc"
            totalFrames={TOTAL_FRAMES}
            bitrate={r.bitrate}
            label={r.label}
          />
        ))}

      {/* Status overlay */}
      {!isRecording && phase !== "done" && (
        <View
          style={{
            width: "100%",
            aspectRatio: WIDTH / HEIGHT,
            borderRadius: 16,
            backgroundColor: "#111",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          {phase === "error" ? (
            <Text
              style={{
                color: colors.error,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {errorMsg}
            </Text>
          ) : (
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: 14,
                textAlign: "center",
              }}
            >
              Records {DURATION_SECONDS}s three times at 200kbps, 2Mbps, and 8Mbps
            </Text>
          )}
        </View>
      )}

      {/* Progress */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {currentLevel}... {progress}%
          </Text>
        </View>
      )}

      {/* Record button */}
      <RippleButton onPress={startComparison} disabled={isRecording} variant="primary">
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          {phase === "done" ? "Compare Again" : "Start Comparison"}
        </Text>
      </RippleButton>
    </View>
  );
};

// Seeded pseudo-random for deterministic particle positions across recordings
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

const particles = (() => {
  const rng = seededRandom(42);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: rng(),
    y: rng(),
    size: 8 + rng() * 24,
    speed: 0.3 + rng() * 1.2,
    hueOffset: rng() * 360,
    phase: rng() * Math.PI * 2,
  }));
})();

function AnimatedContent({ progress }: { progress: number }) {
  const baseHue = 200 + progress * 160;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: hslToHex(baseHue, 40, 15),
      }}
    >
      {/* Moving particles with varying colors and positions */}
      {particles.map((p, i) => {
        const angle = p.phase + progress * p.speed * Math.PI * 4;
        const x = ((p.x + Math.cos(angle) * 0.15 + 1) % 1) * 100;
        const y = ((p.y + Math.sin(angle) * 0.15 + 1) % 1) * 100;
        const hue = (baseHue + p.hueOffset) % 360;

        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: hslToHex(hue, 70, 55),
            }}
          />
        );
      })}

      {/* Center label */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#fff", fontSize: 48, fontWeight: "800" }}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
    </View>
  );
}
