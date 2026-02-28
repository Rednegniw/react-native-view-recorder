import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { NumberFlow } from "number-flow-react-native";
import { useCallback, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { Easing } from "react-native-reanimated";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const DURATION_SECONDS = 5;
const FPS = 60;
const TOTAL_FRAMES = DURATION_SECONDS * FPS;
const WIDTH = 640;
const HEIGHT = 480;
const DEFAULT_BITRATE_MBPS = Math.max(1, Math.round((WIDTH * HEIGHT * FPS) / 10 / 1_000_000));

type Status = "idle" | "recording" | "done" | "error";

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

export const StandardRecordingDemo = () => {
  const recorder = useViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentSecond, setCurrentSecond] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [bitrateText, setBitrateText] = useState("");

  const startRecording = useCallback(async () => {
    setStatus("recording");
    setErrorMsg(null);
    setVideoUri(null);
    setSaved(false);
    setProgress(0);

    const outputFile = new File(Paths.cache, "standard.mp4");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    const parsedBitrate = Number.parseFloat(bitrateText);
    const bitrate = parsedBitrate > 0 ? parsedBitrate * 1_000_000 : undefined;

    try {
      const result = await recorder.record({
        output: outputPath,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        totalFrames: TOTAL_FRAMES,
        optimizeForNetwork: true,
        ...(bitrate && { bitrate }),

        onFrame: async ({ frameIndex }) => {
          setCurrentSecond(Math.floor(frameIndex / FPS) + 1);
          setCurrentFrame(frameIndex);
        },

        onProgress: ({ framesEncoded, totalFrames }) => {
          setProgress(Math.round((framesEncoded / totalFrames) * 100));
        },
      });

      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [bitrateText, recorder]);

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
          <FrameCanvas second={currentSecond} frameIndex={currentFrame} />
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
          totalFrames={TOTAL_FRAMES}
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
              Record a {DURATION_SECONDS}s countdown and encode to MP4
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

      {/* Bitrate input */}
      <View>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            marginBottom: 6,
            marginLeft: 4,
          }}
        >
          Bitrate (Mbps)
        </Text>
        <TextInput
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            color: colors.text,
            fontSize: 16,
          }}
          value={bitrateText}
          onChangeText={setBitrateText}
          placeholder={`${DEFAULT_BITRATE_MBPS} (auto)`}
          placeholderTextColor={colors.textTertiary}
          keyboardType="decimal-pad"
          editable={!isRecording}
        />
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <RippleButton onPress={startRecording} disabled={isRecording} variant="primary">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {status === "done" && <Ionicons name="reload" size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {status === "done" ? "Record Again" : "Record & Encode"}
            </Text>
          </View>
        </RippleButton>

        {status === "done" && (
          <RippleButton
            onPress={saveToLibrary}
            disabled={saved}
            variant={saved ? "success" : "secondary"}
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

function FrameCanvas({ second, frameIndex }: { second: number; frameIndex: number }) {
  const progress = frameIndex / TOTAL_FRAMES;
  const baseHue = 200 + progress * 120;
  const topColor = hslToHex(baseHue, 40, 72);
  const bottomColor = hslToHex(baseHue + 40, 45, 62);

  return (
    <View style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }} collapsable={false}>
      <LinearGradient
        colors={[topColor, bottomColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <NumberFlow
          value={second}
          trend={1}
          spinTiming={SPIN_TIMING}
          style={{ color: "#fff", fontSize: 120, fontWeight: "800" }}
        />
        <Text
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 32,
            fontWeight: "600",
          }}
        >
          / {DURATION_SECONDS}
        </Text>
      </LinearGradient>
    </View>
  );
}
