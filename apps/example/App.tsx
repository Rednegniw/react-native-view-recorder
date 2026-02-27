import { Directory, File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useVideoPlayer, VideoView } from "expo-video";
import { NumberFlow } from "number-flow-react-native";
import { forwardRef, useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { encode } from "react-native-video-encoder";
import { captureRef } from "react-native-view-shot";
import { RippleButton } from "./src/components/RippleButton";

const FRAME_COUNT = 60;
const FPS = 30;
const WIDTH = 640;
const HEIGHT = 480;

type Status = "idle" | "generating" | "encoding" | "done" | "error";

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
  const [currentFrame, setCurrentFrame] = useState(0);
  const [saved, setSaved] = useState(false);
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

      const framesDir = new Directory(Paths.cache, "frames");
      const outputFile = new File(Paths.cache, "output.mp4");

      if (framesDir.exists) framesDir.delete();
      if (outputFile.exists) outputFile.delete();
      framesDir.create();

      for (let i = 0; i < FRAME_COUNT; i++) {
        setCurrentFrame(i);
        await new Promise((r) => setTimeout(r, 50));

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

      const result = await encode({
        folder: folderPath,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        output: outputPath,
      });

      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

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
              {/* Live preview of frame being recorded */}
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
                <FrameCanvas ref={frameRef} frameIndex={currentFrame} />
              </View>

              {/* Progress below the preview */}
              <View style={{ marginTop: 16, alignItems: "center", gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <NumberFlow
                    value={currentFrame + 1}
                    style={{ color: "#fff", fontSize: 28, fontWeight: "700" }}
                  />
                  <Text style={{ color: "#555", fontSize: 28, fontWeight: "700" }}>
                    {" "}
                    / {FRAME_COUNT}
                  </Text>
                </View>
                <Text style={{ color: "#666", fontSize: 13 }}>Capturing frames...</Text>
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
                    Encoding MP4...
                  </Text>
                </>
              ) : status === "error" ? (
                <Text style={{ color: "#ff4444", fontSize: 14, textAlign: "center" }}>
                  {errorMsg}
                </Text>
              ) : (
                <Text style={{ color: "#444", fontSize: 14, textAlign: "center" }}>
                  Generate {FRAME_COUNT} frames and encode to MP4
                </Text>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
            <RippleButton
              onPress={generateAndEncode}
              label={status === "done" ? "Encode Again" : "Generate & Encode"}
              disabled={isWorking}
              variant="primary"
            />

            {status === "done" && (
              <RippleButton
                onPress={saveToLibrary}
                label={saved ? "Saved!" : "Save"}
                disabled={saved}
                variant={saved ? "success" : "secondary"}
              />
            )}
          </View>

          {/* Hidden frame canvas (only used when not recording, since recording shows it live) */}
          {!isRecording && (
            <View style={{ position: "absolute", left: -9999, top: -9999 }} pointerEvents="none">
              <FrameCanvas ref={frameRef} frameIndex={currentFrame} />
            </View>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const FrameCanvas = forwardRef<View, { frameIndex: number }>(({ frameIndex }, ref) => {
  const progress = frameIndex / FRAME_COUNT;

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
        <Text style={{ color: "#fff", fontSize: 120, fontWeight: "800" }}>{frameIndex + 1}</Text>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 32, fontWeight: "600" }}>
          / {FRAME_COUNT}
        </Text>
      </LinearGradient>
    </View>
  );
});
