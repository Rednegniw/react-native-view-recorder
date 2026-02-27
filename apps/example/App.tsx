import { Ionicons } from "@expo/vector-icons";
import { Directory, File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { NumberFlow } from "number-flow-react-native";
import { forwardRef, useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Easing } from "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { encode } from "react-native-video-encoder";
import { captureRef } from "react-native-view-shot";
import { RippleButton } from "./src/components/RippleButton";

const DURATION_SECONDS = 5;
const FPS = 30;
const TOTAL_FRAMES = DURATION_SECONDS * FPS;
const WIDTH = 640;
const HEIGHT = 480;
const DEFAULT_BITRATE_MBPS = Math.max(1, Math.round((WIDTH * HEIGHT * FPS) / 10 / 1_000_000));

type Status = "idle" | "generating" | "encoding" | "done" | "error";

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

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentSecond, setCurrentSecond] = useState(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [bitrateText, setBitrateText] = useState("");
  const frameRef = useRef<View>(null);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    if (videoUri) p.play();
  });

  const generateAndEncode = useCallback(async () => {
    try {
      setStatus("generating");
      setErrorMsg(null);
      setVideoUri(null);
      setSaved(false);
      setEncodeProgress(0);
      setCaptureProgress(0);

      const framesDir = new Directory(Paths.cache, "frames");
      const outputFile = new File(Paths.cache, "output.mp4");

      if (framesDir.exists) framesDir.delete();
      if (outputFile.exists) outputFile.delete();
      framesDir.create();

      // Capture TOTAL_FRAMES frames. The displayed number changes once per second.
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const second = Math.floor(i / FPS) + 1;
        setCurrentSecond(second);
        setCurrentFrame(i);
        setCaptureProgress(i + 1);

        await new Promise((r) => setTimeout(r, 40));

        const uri = await captureRef(frameRef, {
          format: "png",
          width: WIDTH,
          height: HEIGHT,
          quality: 1,
        });

        const frameName = `frame_${String(i).padStart(5, "0")}.png`;
        const captured = new File(uri);
        captured.move(new File(framesDir, frameName));
      }

      setStatus("encoding");
      const folderPath = `${framesDir.uri.replace("file://", "")}/`;
      const outputPath = outputFile.uri.replace("file://", "");

      const parsedBitrate = Number.parseFloat(bitrateText);
      const bitrate = parsedBitrate > 0 ? parsedBitrate * 1_000_000 : undefined;

      const result = await encode({
        folder: folderPath,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        output: outputPath,
        optimizeForNetwork: true,
        ...(bitrate && { bitrate }),
        onProgress: ({ framesEncoded, totalFrames }) => {
          setEncodeProgress(Math.round((framesEncoded / totalFrames) * 100));
        },
      });

      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [bitrateText]);

  const saveToLibrary = useCallback(async () => {
    if (!videoUri) return;

    const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
    if (permStatus !== "granted") {
      Alert.alert("Permission needed", "Camera roll access is required to save the video.");
      return;
    }

    await MediaLibrary.saveToLibraryAsync(videoUri);
    setSaved(true);
  }, [videoUri]);

  const isWorking = status === "generating" || status === "encoding";
  const isRecording = status === "generating";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: "#000",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 20,
          }}
        >
          {/* Main display area */}
          {videoUri && status === "done" ? (
            <View
              style={{
                width: "100%",
                aspectRatio: WIDTH / HEIGHT,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: "#111",
              }}
            >
              <VideoView
                player={player}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />
            </View>
          ) : isRecording ? (
            <View style={{ width: "100%", alignItems: "center" }}>
              {/* Live preview */}
              <View
                style={{
                  width: "100%",
                  aspectRatio: WIDTH / HEIGHT,
                  borderRadius: 16,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#FF3B30",
                }}
              >
                <FrameCanvas ref={frameRef} second={currentSecond} frameIndex={currentFrame} />
              </View>

              {/* Capture progress */}
              <View style={{ marginTop: 16, alignItems: "center", gap: 6 }}>
                <Text style={{ color: "#aaa", fontSize: 14 }}>
                  Capturing frame {captureProgress} / {TOTAL_FRAMES}
                </Text>
              </View>
            </View>
          ) : (
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
              {status === "encoding" ? (
                <>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={{ color: "#aaa", fontSize: 14, marginTop: 12 }}>
                    Encoding... {encodeProgress}%
                  </Text>
                </>
              ) : status === "error" ? (
                <Text style={{ color: "#ff4444", fontSize: 14, textAlign: "center" }}>
                  {errorMsg}
                </Text>
              ) : (
                <Text style={{ color: "#444", fontSize: 14, textAlign: "center" }}>
                  Record a {DURATION_SECONDS}s countdown and encode to MP4
                </Text>
              )}
            </View>
          )}

          {/* Bitrate input */}
          <View style={{ width: "100%", marginTop: 20 }}>
            <Text style={{ color: "#aaa", fontSize: 12, marginBottom: 6, marginLeft: 4 }}>
              Bitrate (Mbps)
            </Text>
            <TextInput
              style={{
                backgroundColor: "#1a1a1a",
                borderWidth: 1,
                borderColor: "#333",
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: "#fff",
                fontSize: 16,
              }}
              value={bitrateText}
              onChangeText={setBitrateText}
              placeholder={`${DEFAULT_BITRATE_MBPS} (auto)`}
              placeholderTextColor="#555"
              keyboardType="decimal-pad"
              editable={!isWorking}
            />
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <RippleButton onPress={generateAndEncode} disabled={isWorking} variant="primary">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {status === "done" && <Ionicons name="reload" size={18} color="#fff" />}
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                  {status === "done" ? "Encode Again" : "Generate & Encode"}
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

          {/* Hidden frame canvas (only used when not recording, since recording shows it live) */}
          {!isRecording && (
            <View style={{ position: "absolute", left: -9999, top: -9999 }} pointerEvents="none">
              <FrameCanvas ref={frameRef} second={currentSecond} frameIndex={currentFrame} />
            </View>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const FrameCanvas = forwardRef<View, { second: number; frameIndex: number }>(
  ({ second, frameIndex }, ref) => {
    const progress = frameIndex / TOTAL_FRAMES;
    const baseHue = 200 + progress * 120;
    const topColor = hslToHex(baseHue, 40, 72);
    const bottomColor = hslToHex(baseHue + 40, 45, 62);

    return (
      <View ref={ref} style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }} collapsable={false}>
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
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 32, fontWeight: "600" }}>
            / {DURATION_SECONDS}
          </Text>
        </LinearGradient>
      </View>
    );
  },
);
