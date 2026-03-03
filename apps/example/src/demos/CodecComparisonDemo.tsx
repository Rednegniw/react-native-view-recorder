import { File, Paths } from "expo-file-system";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import type { VideoCodec } from "react-native-view-recorder";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 30;
const DURATION_SECONDS = 1.5;
const TOTAL_FRAMES = Math.round(DURATION_SECONDS * FPS);
const WIDTH = 320;
const HEIGHT = 240;

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

type Phase = "idle" | "recording-h264" | "recording-hevc" | "done" | "error";

interface Result {
  uri: string;
  codec: VideoCodec;
}

export const CodecComparisonDemo = () => {
  const recorder = useViewRecorder();

  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<Result[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [frameProgress, setFrameProgress] = useState(0);

  const isRecording = phase === "recording-h264" || phase === "recording-hevc";

  const recordWithCodec = useCallback(
    async (codec: VideoCodec): Promise<Result> => {
      const filename = `codec_${codec}.mp4`;
      const outputFile = new File(Paths.cache, filename);
      if (outputFile.exists) outputFile.delete();
      const outputPath = outputFile.uri.replace("file://", "");

      const uri = await recorder.record({
        output: outputPath,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        totalFrames: TOTAL_FRAMES,
        codec,
        optimizeForNetwork: true,

        onFrame: async ({ frameIndex, totalFrames }) => {
          setFrameProgress(frameIndex / (totalFrames ?? 1));
        },

        onProgress: ({ framesEncoded, totalFrames }) => {
          setProgress(Math.round((framesEncoded / (totalFrames ?? 1)) * 100));
        },
      });

      return { uri, codec };
    },
    [recorder],
  );

  const startComparison = useCallback(async () => {
    setResults([]);
    setErrorMsg(null);

    try {
      setPhase("recording-h264");
      setProgress(0);
      const h264 = await recordWithCodec("h264");

      setPhase("recording-hevc");
      setProgress(0);
      const hevc = await recordWithCodec("hevc");

      setResults([h264, hevc]);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [recordWithCodec]);

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
            key={r.codec}
            uri={r.uri}
            width={WIDTH}
            height={HEIGHT}
            fps={FPS}
            codec={r.codec}
            totalFrames={TOTAL_FRAMES}
            label={r.codec === "h264" ? "H.264" : "HEVC"}
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
              Records {DURATION_SECONDS}s twice: once with H.264, once with HEVC
            </Text>
          )}
        </View>
      )}

      {/* Progress */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {phase === "recording-h264" ? "Recording H.264" : "Recording HEVC"}
            ... {progress}%
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

function AnimatedContent({ progress }: { progress: number }) {
  const hue = 200 + progress * 160;
  const backgroundColor = hslToHex(hue, 50, 50);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 48, fontWeight: "800" }}>
        {Math.round(progress * 100)}%
      </Text>
    </View>
  );
}
