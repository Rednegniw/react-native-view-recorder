import { Directory, File, Paths } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import { forwardRef, useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { encode } from "react-native-video-encoder";
import { captureRef } from "react-native-view-shot";

const FRAME_COUNT = 60;
const FPS = 60;
const WIDTH = 640;
const HEIGHT = 480;

type Status = "idle" | "generating" | "encoding" | "done" | "error";

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
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

      const framesDir = new Directory(Paths.cache, "frames");
      const outputFile = new File(Paths.cache, "output.mp4");

      // Clean up previous runs
      if (framesDir.exists) framesDir.delete();
      if (outputFile.exists) outputFile.delete();
      framesDir.create();

      // Capture frames from the hidden FrameCanvas component
      for (let i = 0; i < FRAME_COUNT; i++) {
        setCurrentFrame(i);
        // Small delay to let React render the frame
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

      // Encode frames to MP4
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>React Native Video Encoder</Text>
        <Text style={styles.subtitle}>PNG sequence to MP4, on-device</Text>

        {/* Video player */}
        {videoUri && status === "done" ? (
          <View style={styles.videoContainer}>
            <VideoView player={player} style={styles.video} contentFit="contain" />
          </View>
        ) : (
          <View style={styles.placeholder}>
            {status === "generating" ? (
              <>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.statusText}>
                  Generating frame {currentFrame + 1}/{FRAME_COUNT}...
                </Text>
              </>
            ) : status === "encoding" ? (
              <>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.statusText}>Encoding MP4...</Text>
              </>
            ) : status === "error" ? (
              <Text style={styles.errorText}>{errorMsg}</Text>
            ) : (
              <Text style={styles.placeholderText}>
                Tap the button below to generate {FRAME_COUNT} frames and encode them into an MP4
              </Text>
            )}
          </View>
        )}

        {/* Encode button */}
        <Pressable
          style={[
            styles.button,
            status === "generating" || status === "encoding" ? styles.buttonDisabled : null,
          ]}
          onPress={generateAndEncode}
          disabled={status === "generating" || status === "encoding"}
        >
          <Text style={styles.buttonText}>
            {status === "done" ? "Encode Again" : "Generate & Encode"}
          </Text>
        </Pressable>

        {/* Hidden frame canvas for capturing */}
        <View style={styles.offscreen} pointerEvents="none">
          <FrameCanvas ref={frameRef} frameIndex={currentFrame} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const FrameCanvas = forwardRef<View, { frameIndex: number }>(({ frameIndex }, ref) => {
  const hue = (frameIndex / FRAME_COUNT) * 360;
  const backgroundColor = `hsl(${hue}, 70%, 50%)`;

  return (
    <View ref={ref} style={[styles.frame, { backgroundColor }]} collapsable={false}>
      <Text style={styles.frameNumber}>{frameIndex + 1}</Text>
      <Text style={styles.frameLabel}>/ {FRAME_COUNT}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 20,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
  },
  videoContainer: {
    width: "100%",
    aspectRatio: WIDTH / HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    aspectRatio: WIDTH / HEIGHT,
    borderRadius: 12,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  placeholderText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
  },
  statusText: {
    color: "#aaa",
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 14,
    textAlign: "center",
  },
  button: {
    marginTop: 20,
    backgroundColor: "#007AFF",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  offscreen: {
    position: "absolute",
    left: -9999,
    top: -9999,
  },
  frame: {
    width: WIDTH,
    height: HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  frameNumber: {
    color: "#fff",
    fontSize: 120,
    fontWeight: "800",
  },
  frameLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 32,
    fontWeight: "600",
  },
});
