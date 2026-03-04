import {
  Canvas,
  Circle,
  Fill,
  Group,
  LinearGradient,
  RoundedRect,
  vec,
} from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RipplePressable } from "../components/RipplePressable";

const FPS = 60;
const DURATION_SECONDS = 3;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
const OUTPUT_SIZE = 640;

function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const hex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export const AutoplaySkiaDemo = () => {
  const recorder = useViewRecorder();
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [frameProgress, setFrameProgress] = useState(0);
  const [canvasSize, setCanvasSize] = useState(300);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  const handleRecord = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    setVideoUri(null);
    setFrameProgress(0);

    const outputFile = new File(Paths.cache, "autoplay-skia.mp4");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    try {
      const result = await recorder.record({
        output: outputPath,
        fps: FPS,
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
        totalFrames: TOTAL_FRAMES,
        onFrame: async ({ frameIndex, totalFrames }) => {
          setFrameProgress(frameIndex / (totalFrames ?? 1));
        },
      });

      setVideoUri(result);
    } finally {
      setRecording(false);
    }
  }, [recorder, recording]);

  const angle = frameProgress * Math.PI * 4;
  const hue = 200 + frameProgress * 160;
  const s = canvasSize;
  const cx = s / 2;
  const cy = s / 2;
  const rectSize = s * 0.3;
  const halfRect = rectSize / 2;
  const cornerR = rectSize * 0.16;
  const orbitR = s * 0.33;
  const ballR = s * 0.033;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        padding: 20,
        justifyContent: "center",
      }}
    >
      {/* REC indicator */}
      {recording && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" }} />
          <Text style={{ color: "#FF3B30", fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>
            REC
          </Text>
        </View>
      )}

      <View
        style={{
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: recording ? 2 : 0,
          borderColor: "#FF3B30",
        }}
      >
        {!videoUri ? (
          <RecordingView
            sessionId={recorder.sessionId}
            style={{ width: "100%", aspectRatio: 1 }}
            pointerEvents="none"
            onLayout={(e) => setCanvasSize(e.nativeEvent.layout.width)}
          >
            <Canvas style={{ flex: 1 }}>
              <Fill color="black" />
              {/* Rotating rounded rectangle with gradient */}
              <Group
                transform={[
                  { translateX: cx },
                  { translateY: cy },
                  { rotate: angle },
                  { translateX: -halfRect },
                  { translateY: -halfRect },
                ]}
              >
                <RoundedRect x={0} y={0} width={rectSize} height={rectSize} r={cornerR}>
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(rectSize, rectSize)}
                    colors={[hsl(hue, 70, 60), hsl(hue + 60, 80, 50)]}
                  />
                </RoundedRect>
              </Group>

              {/* Orbiting circles */}
              {Array.from({ length: 5 }).map((_, i) => {
                const a = -angle + (i * Math.PI * 2) / 5;
                return (
                  <Circle
                    key={i}
                    cx={cx + Math.cos(a) * orbitR}
                    cy={cy + Math.sin(a) * orbitR}
                    r={ballR}
                    color={hsl((hue + i * 40) % 360, 80, 65)}
                  />
                );
              })}
            </Canvas>
          </RecordingView>
        ) : (
          <VideoView
            player={player}
            style={{ width: "100%", aspectRatio: 1 }}
            nativeControls={false}
          />
        )}
      </View>

      <RipplePressable
        onPress={handleRecord}
        style={{
          marginTop: 16,
          backgroundColor: "#1a1a1a",
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          {recording ? "Recording..." : "Record"}
        </Text>
      </RipplePressable>
    </View>
  );
};
