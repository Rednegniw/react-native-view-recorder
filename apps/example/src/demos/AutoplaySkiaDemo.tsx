import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  RoundedRect,
  vec,
} from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { SkiaRecordingView, useSkiaViewRecorder } from "react-native-view-recorder";
import { RecIndicator } from "../components/RecIndicator";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 60;
const DURATION_SECONDS = 3;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
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

type Phase = "recording" | "done";

export const AutoplaySkiaDemo = () => {
  const recorder = useSkiaViewRecorder();
  const mountedRef = useRef(true);
  const recordingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("recording");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [frameProgress, setFrameProgress] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  const startRecording = useCallback(async () => {
    if (recordingRef.current || !mountedRef.current) return;
    recordingRef.current = true;

    setPhase("recording");
    setVideoUri(null);
    setFrameProgress(0);

    const outputFile = new File(Paths.cache, "autoplay-skia.mp4");
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
      });

      if (!mountedRef.current) return;
      setVideoUri(result);
      setPhase("done");
    } catch {
      if (mountedRef.current) setPhase("recording");
    } finally {
      recordingRef.current = false;
    }
  }, [recorder]);

  // Auto-start on mount
  useEffect(() => {
    mountedRef.current = true;
    startRecording();
    return () => {
      mountedRef.current = false;
    };
  }, [startRecording]);

  // Auto-restart after showing result
  useEffect(() => {
    if (phase !== "done") return;
    const timeout = setTimeout(startRecording, 4000);
    return () => clearTimeout(timeout);
  }, [phase, startRecording]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
      }}
    >
      {/* Skia recording content */}
      {phase !== "done" && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          style={{ width: "100%" }}
        >
          <View style={{ marginBottom: 8 }}>
            <RecIndicator />
          </View>

          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: colors.recording,
            }}
          >
            <SkiaRecordingView
              viewRef={recorder.viewRef}
              sessionId={recorder.sessionId}
              style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
              pointerEvents="none"
            >
              <SkiaContent
                progress={frameProgress}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                onCanvasLayout={setCanvasSize}
              />
            </SkiaRecordingView>
          </View>
        </Animated.View>
      )}

      {/* Video result */}
      {videoUri && phase === "done" && (
        <Animated.View entering={FadeIn.duration(300)} style={{ width: "100%" }}>
          <VideoOverview
            uri={videoUri}
            width={WIDTH}
            height={HEIGHT}
            fps={FPS}
            codec="hevc"
            totalFrames={TOTAL_FRAMES}
          />
        </Animated.View>
      )}
    </View>
  );
};

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
  const orbitRadius = 150 * scale;
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
          const circleAngle = -angle + (i * Math.PI * 2) / numCircles;
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
