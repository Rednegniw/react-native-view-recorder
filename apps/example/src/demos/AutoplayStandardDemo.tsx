import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { NumberFlow } from "number-flow-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Easing } from "react-native-reanimated";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RecIndicator } from "../components/RecIndicator";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 60;
const DURATION_SECONDS = 5;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
const WIDTH = 640;
const HEIGHT = 480;

const SPIN_TIMING = { duration: 900, easing: Easing.out(Easing.cubic) };

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

type Phase = "idle" | "recording" | "done";

export const AutoplayStandardDemo = () => {
  const recorder = useViewRecorder();
  const mountedRef = useRef(true);
  const recordingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [currentSecond, setCurrentSecond] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || !mountedRef.current) return;
    recordingRef.current = true;

    setPhase("recording");
    setCurrentSecond(1);
    setCurrentFrame(0);
    setVideoUri(null);

    const outputFile = new File(Paths.cache, "autoplay-standard.mp4");
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
        onFrame: async ({ frameIndex }) => {
          setCurrentSecond(Math.floor(frameIndex / FPS) + 1);
          setCurrentFrame(frameIndex);
        },
      });

      if (!mountedRef.current) return;
      setVideoUri(result);
      setPhase("done");
    } catch {
      if (mountedRef.current) setPhase("idle");
    } finally {
      recordingRef.current = false;
    }
  }, [recorder]);

  // Auto-start after mount
  useEffect(() => {
    mountedRef.current = true;
    const timeout = setTimeout(startRecording, 1500);
    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
    };
  }, [startRecording]);

  // Auto-restart after showing result
  useEffect(() => {
    if (phase !== "done") return;
    const timeout = setTimeout(startRecording, 4000);
    return () => clearTimeout(timeout);
  }, [phase, startRecording]);

  const isRecording = phase === "recording";
  const progress = currentFrame / TOTAL_FRAMES;
  const baseHue = 200 + progress * 120;
  const topColor = hslToHex(baseHue, 40, 72);
  const bottomColor = hslToHex(baseHue + 40, 45, 62);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* REC indicator (outside RecordingView, so it shows on screen but not in video) */}
      {isRecording && <RecIndicator />}

      {/* Recording content */}
      {phase !== "done" && (
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <RecordingView
            sessionId={recorder.sessionId}
            style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
            pointerEvents="none"
          >
            <View style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }} collapsable={false}>
              <LinearGradient
                colors={[topColor, bottomColor]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
              >
                <NumberFlow
                  value={currentSecond}
                  trend={1}
                  spinTiming={SPIN_TIMING}
                  style={{ color: "#fff", fontSize: 120, fontWeight: "800" }}
                />
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 32, fontWeight: "600" }}>
                  / {DURATION_SECONDS}
                </Text>
              </LinearGradient>
            </View>
          </RecordingView>
        </View>
      )}

      {/* Video result */}
      {videoUri && phase === "done" && (
        <View style={{ width: "100%", paddingHorizontal: 20 }}>
          <VideoOverview
            uri={videoUri}
            width={WIDTH}
            height={HEIGHT}
            fps={FPS}
            codec="hevc"
            totalFrames={TOTAL_FRAMES}
          />
        </View>
      )}
    </View>
  );
};
