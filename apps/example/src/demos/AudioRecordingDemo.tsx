import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useRef, useState } from "react";
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

const SAMPLE_RATE = 44100;
const WAV_DURATION = 5; // seconds (longer than video so we always have audio)

// Generate a WAV file with a rising sine wave (220 Hz to 880 Hz)
function generateWavFile(): string {
  const numSamples = SAMPLE_RATE * WAV_DURATION;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Generate rising sine wave (220 Hz -> 880 Hz)
  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    const freq = 220 + t * 660;
    const sample = Math.sin(phase) * 0.3;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;

    const pcm16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(headerSize + i * bytesPerSample, pcm16, true);
  }

  // Write to file
  const wavFile = new File(Paths.cache, "demo-audio.wav");
  if (wavFile.exists) wavFile.delete();

  const bytes = new Uint8Array(buffer);
  wavFile.write(bytes);

  return wavFile.uri.replace("file://", "");
}

type Status = "idle" | "generating" | "recording" | "done" | "error";

export const AudioRecordingDemo = () => {
  const recorder = useViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const wavPathRef = useRef<string | null>(null);

  // Pre-generate the WAV file on mount
  useEffect(() => {
    wavPathRef.current = generateWavFile();
  }, []);

  const startRecording = useCallback(async () => {
    if (!wavPathRef.current) {
      setStatus("generating");
      wavPathRef.current = generateWavFile();
    }

    setStatus("recording");
    setErrorMsg(null);
    setVideoUri(null);
    setSaved(false);
    setProgress(0);
    setCurrentFrame(0);

    const outputFile = new File(Paths.cache, "audio-file.mp4");
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
          setProgress(Math.round((framesEncoded / (totalFrames ?? 1)) * 100));
        },

        audioFile: { path: wavPathRef.current! },
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
  const freq = 220 + (currentFrame / TOTAL_FRAMES) * 660;

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
                audio file muxed natively
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
              Record {DURATION_SECONDS}s of video with a rising sine wave{"\n"}muxed from a WAV file
              via the audioFile option.
            </Text>
          )}
        </View>
      )}

      {/* Progress */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            Recording with audio... {progress}%
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
              {status === "done" ? "Record Again" : "Record with Audio"}
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
