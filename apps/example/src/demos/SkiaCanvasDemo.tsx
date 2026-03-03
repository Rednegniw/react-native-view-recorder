import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  RoundedRect,
  vec,
} from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SkiaRecordingView, useSkiaViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 60;
const DURATION_SECONDS = 3;
const TOTAL_FRAMES = DURATION_SECONDS * FPS;
const WIDTH = 640;
const HEIGHT = 480;

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

type Status = "idle" | "recording" | "done" | "error";

export const SkiaCanvasDemo = () => {
  const recorder = useSkiaViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [frameProgress, setFrameProgress] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  const isRecording = status === "recording";

  const startRecording = useCallback(async () => {
    setStatus("recording");
    setErrorMsg(null);
    setVideoUri(null);
    setProgress(0);
    setFrameProgress(0);

    const outputFile = new File(Paths.cache, "skia.mp4");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    try {
      const result = await recorder.record({
        output: outputPath,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        totalFrames: TOTAL_FRAMES,
        optimizeForNetwork: true,

        onFrame: async ({ frameIndex, totalFrames }) => {
          setFrameProgress(frameIndex / (totalFrames ?? 1));
        },

        onProgress: ({ framesEncoded, totalFrames }) => {
          setProgress(Math.round((framesEncoded / (totalFrames ?? 1)) * 100));
        },
      });

      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [recorder]);

  return (
    <View style={{ gap: 16 }}>
      {/* SkiaRecordingView: always mounted, offscreen when not recording.
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
        <SkiaRecordingView
          viewRef={recorder.viewRef}
          sessionId={recorder.sessionId}
          style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
          pointerEvents={isRecording ? "auto" : "none"}
        >
          <SkiaContent
            progress={frameProgress}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            onCanvasLayout={setCanvasSize}
          />
        </SkiaRecordingView>
      </View>

      {/* Video result */}
      {videoUri && status === "done" && (
        <VideoOverview
          uri={videoUri}
          width={WIDTH}
          height={HEIGHT}
          fps={FPS}
          codec="hevc"
          totalFrames={TOTAL_FRAMES}
        />
      )}

      {/* Status overlay */}
      {!isRecording && !(videoUri && status === "done") && (
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
          {status === "error" ? (
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
              Record a {DURATION_SECONDS}s Skia animation and encode to MP4
            </Text>
          )}
        </View>
      )}

      {/* Progress */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            Recording... {progress}%
          </Text>
        </View>
      )}

      {/* Record button */}
      <RippleButton onPress={startRecording} disabled={isRecording} variant="primary">
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          {status === "done" ? "Record Again" : "Record & Encode"}
        </Text>
      </RippleButton>
    </View>
  );
};

// Skia canvas content: rotating rounded rect with gradient + orbiting circles.
// Coordinates are derived from actual canvas point dimensions (not video pixel dimensions)
// since the Skia Canvas coordinate system matches the view's layout size.
function SkiaContent({
  progress,
  canvasWidth,
  canvasHeight,
  onCanvasLayout,
}: {
  progress: number;
  canvasWidth: number;
  canvasHeight: number;
  onCanvasLayout: (size: { width: number; height: number }) => void;
}) {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const scale = Math.min(canvasWidth / WIDTH, canvasHeight / HEIGHT);
  const angle = progress * Math.PI * 4;
  const hue = 200 + progress * 160;

  const rectSize = 160 * scale;
  const halfRect = rectSize / 2;
  const orbitRadius = 120 * scale;
  const circleRadius = 14 * scale;
  const cornerRadius = 24 * scale;
  const numCircles = 5;

  return (
    <View
      style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
      onLayout={(e) =>
        onCanvasLayout({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      <Canvas style={{ width: "100%", height: "100%" }}>
        {/* Rotating rounded rectangle */}
        <Group
          transform={[
            { translateX: cx },
            { translateY: cy },
            { rotate: angle },
            { translateX: -halfRect },
            { translateY: -halfRect },
          ]}
        >
          <RoundedRect x={0} y={0} width={rectSize} height={rectSize} r={cornerRadius}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(rectSize, rectSize)}
              colors={[hslToHex(hue, 70, 60), hslToHex(hue + 60, 80, 50)]}
            />
          </RoundedRect>
        </Group>

        {/* Orbiting circles */}
        {Array.from({ length: numCircles }).map((_, i) => {
          const circleAngle = angle + (i * Math.PI * 2) / numCircles;
          const x = cx + Math.cos(circleAngle) * orbitRadius;
          const y = cy + Math.sin(circleAngle) * orbitRadius;
          const circleHue = (hue + i * 40) % 360;

          return (
            <Circle key={i} cx={x} cy={y} r={circleRadius} color={hslToHex(circleHue, 80, 65)} />
          );
        })}
      </Canvas>
    </View>
  );
}
