import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RipplePressable } from "../components/RipplePressable";

const FPS = 60;
const DURATION_SECONDS = 5;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
const WIDTH = 640;
const HEIGHT = 480;

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

export const AutoplayStandardDemo = () => {
  const recorder = useViewRecorder();
  const [recording, setRecording] = useState(false);
  const [currentSecond, setCurrentSecond] = useState(1);
  const [progress, setProgress] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  const handleRecord = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    setCurrentSecond(1);
    setProgress(0);
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
        onFrame: async ({ frameIndex }) => {
          setCurrentSecond(Math.floor(frameIndex / FPS) + 1);
        },
        onProgress: ({ framesEncoded, totalFrames }) => {
          setProgress(Math.round((framesEncoded / totalFrames) * 100));
        },
      });

      setVideoUri(result);
    } finally {
      setRecording(false);
    }
  }, [recorder, recording]);

  const hue = 200 + ((currentSecond - 1) / DURATION_SECONDS) * 120;

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
            style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
            pointerEvents="none"
          >
            <View style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }} collapsable={false}>
              <LinearGradient
                colors={[hsl(hue, 40, 72), hsl(hue + 40, 45, 62)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontSize: 120, fontWeight: "800" }}>
                  {currentSecond}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 28 }}>
                  / {DURATION_SECONDS}
                </Text>
              </LinearGradient>
            </View>
          </RecordingView>
        ) : (
          <VideoView
            player={player}
            style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
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
          {recording ? `Recording... ${progress}%` : "Record"}
        </Text>
      </RipplePressable>
    </View>
  );
};
