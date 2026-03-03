import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 60;
const WIDTH = 640;
const HEIGHT = 480;

type Status = "idle" | "recording" | "done" | "error";

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

function formatElapsed(frames: number): string {
  const totalSeconds = Math.floor(frames / FPS);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const tenths = Math.floor((frames % FPS) / (FPS / 10));
  return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export const EventDrivenDemo = () => {
  const recorder = useViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [finalFrameCount, setFinalFrameCount] = useState(0);
  const frameCountRef = useRef(0);
  const [saved, setSaved] = useState(false);

  const startRecording = useCallback(async () => {
    setStatus("recording");
    setErrorMsg(null);
    setVideoUri(null);
    setSaved(false);
    setCurrentFrame(0);

    const outputFile = new File(Paths.cache, "event-driven.mp4");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    try {
      const result = await recorder.record({
        output: outputPath,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        optimizeForNetwork: true,

        onFrame: async ({ frameIndex }) => {
          setCurrentFrame(frameIndex);
        },

        onProgress: ({ framesEncoded }) => {
          frameCountRef.current = framesEncoded;
        },
      });

      setFinalFrameCount(frameCountRef.current);
      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [recorder]);

  const stopRecording = useCallback(() => {
    recorder.stop();
  }, [recorder]);

  const saveToLibrary = useCallback(async () => {
    if (!videoUri) return;

    const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
    if (permStatus !== "granted") {
      Alert.alert("Permission needed", "Camera roll access is required to save the video.");
      return;
    }

    await MediaLibrary.saveToLibraryAsync(`file://${videoUri}`);
    setSaved(true);
  }, [videoUri]);

  const isRecording = status === "recording";
  const baseHue = (currentFrame * 0.5) % 360;
  const topColor = hslToHex(baseHue, 40, 72);
  const bottomColor = hslToHex(baseHue + 40, 45, 62);

  return (
    <View style={{ gap: 16 }}>
      {/* RecordingView */}
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
          <View style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }} collapsable={false}>
            <LinearGradient
              colors={[topColor, bottomColor]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 72,
                  fontWeight: "800",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatElapsed(currentFrame)}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 20, fontWeight: "600" }}>
                {currentFrame} frames
              </Text>
            </LinearGradient>
          </View>
        </RecordingView>
      </View>

      {/* Video result */}
      {videoUri && status === "done" && (
        <VideoOverview
          uri={videoUri}
          width={WIDTH}
          height={HEIGHT}
          fps={FPS}
          codec="hevc"
          totalFrames={finalFrameCount}
        />
      )}

      {/* Status overlay (idle/error) */}
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
            <Text style={{ color: colors.error, fontSize: 14, textAlign: "center" }}>
              {errorMsg}
            </Text>
          ) : (
            <Text style={{ color: colors.textTertiary, fontSize: 14, textAlign: "center" }}>
              Record until you tap Stop. No totalFrames needed.
            </Text>
          )}
        </View>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            Recording... {formatElapsed(currentFrame)}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        {!isRecording && (
          <RippleButton onPress={startRecording} variant="primary" style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {status === "done" && <Ionicons name="reload" size={18} color="#fff" />}
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                {status === "done" ? "Record Again" : "Start Recording"}
              </Text>
            </View>
          </RippleButton>
        )}

        {isRecording && (
          <RippleButton onPress={stopRecording} variant="primary" style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="stop-circle-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Stop</Text>
            </View>
          </RippleButton>
        )}

        {status === "done" && (
          <RippleButton
            onPress={saveToLibrary}
            disabled={saved}
            variant={saved ? "success" : "secondary"}
            style={{ flex: 1 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={saved ? "checkmark-circle" : "download-outline"}
                size={18}
                color="#fff"
              />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                {saved ? "Saved!" : "Save"}
              </Text>
            </View>
          </RippleButton>
        )}
      </View>
    </View>
  );
};
