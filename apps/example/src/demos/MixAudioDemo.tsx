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
const DURATION_SECONDS = 3;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
const WIDTH = 640;
const HEIGHT = 480;

const START_FREQ = 220;
const END_FREQ = 880;
const AMPLITUDE = 0.3;

type Status = "idle" | "recording" | "done" | "error";

export const MixAudioDemo = () => {
  const recorder = useViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const phaseRef = useRef(0);

  const startRecording = useCallback(async () => {
    setStatus("recording");
    setErrorMsg(null);
    setVideoUri(null);
    setSaved(false);
    setProgress(0);
    setCurrentFrame(0);
    phaseRef.current = 0;

    const outputFile = new File(Paths.cache, "mix-audio.mp4");
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
          setCurrentFrame(frameIndex);
        },

        onProgress: ({ framesEncoded, totalFrames }) => {
          setProgress(Math.round((framesEncoded / totalFrames) * 100));
        },

        mixAudio: ({ frameIndex, samplesNeeded, sampleRate }) => {
          const samples = new Float32Array(samplesNeeded);
          for (let i = 0; i < samplesNeeded; i++) {
            const globalT =
              ((frameIndex * sampleRate) / FPS + i) / ((TOTAL_FRAMES * sampleRate) / FPS);
            const freq = START_FREQ + globalT * (END_FREQ - START_FREQ);
            samples[i] = Math.sin(phaseRef.current) * AMPLITUDE;
            phaseRef.current += (2 * Math.PI * freq) / sampleRate;
          }
          return samples;
        },
      });

      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
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
  const freq = START_FREQ + (currentFrame / TOTAL_FRAMES) * (END_FREQ - START_FREQ);

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
              colors={["#1a1a2e", "#16213e"]}
              style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8 }}
            >
              <Ionicons name="musical-notes" size={48} color="rgba(255,255,255,0.4)" />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 48,
                  fontWeight: "800",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {Math.round(freq)} Hz
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>
                audio generated via mixAudio callback
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
            <Text style={{ color: colors.error, fontSize: 14, textAlign: "center" }}>
              {errorMsg}
            </Text>
          ) : (
            <Text style={{ color: colors.textTertiary, fontSize: 14, textAlign: "center" }}>
              Record {DURATION_SECONDS}s of video with a rising sine wave{"\n"}generated in
              real-time via the mixAudio callback.
            </Text>
          )}
        </View>
      )}

      {/* Progress */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            Recording with mixAudio... {progress}%
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <RippleButton
          onPress={startRecording}
          disabled={isRecording}
          variant="primary"
          style={{ flex: 1 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {status === "done" && <Ionicons name="reload" size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {status === "done" ? "Record Again" : "Record with mixAudio"}
            </Text>
          </View>
        </RippleButton>

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
