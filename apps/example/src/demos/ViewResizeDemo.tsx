import { File, Paths } from "expo-file-system";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { VideoOverview } from "../components/VideoOverview";
import { colors } from "../theme/colors";

const FPS = 30;
const DURATION_SECONDS = 3;
const TOTAL_FRAMES = DURATION_SECONDS * FPS;
const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 480;

// View starts at half the output size, expands to full at the halfway point
const SMALL_SCALE = 0.5;
const LARGE_SCALE = 1.0;
const RESIZE_FRAME = Math.floor(TOTAL_FRAMES / 2);

type Status = "idle" | "recording" | "done" | "error";

export const ViewResizeDemo = () => {
  const recorder = useViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [viewScale, setViewScale] = useState(SMALL_SCALE);
  const [currentFrame, setCurrentFrame] = useState(0);

  const isRecording = status === "recording";

  const startRecording = useCallback(async () => {
    setStatus("recording");
    setErrorMsg(null);
    setVideoUri(null);
    setProgress(0);
    setViewScale(SMALL_SCALE);
    setCurrentFrame(0);

    const outputFile = new File(Paths.cache, "resize.mp4");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    try {
      const result = await recorder.record({
        output: outputPath,
        fps: FPS,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        totalFrames: TOTAL_FRAMES,
        optimizeForNetwork: true,

        onFrame: async ({ frameIndex }) => {
          setCurrentFrame(frameIndex);
          // Resize at the halfway point
          if (frameIndex < RESIZE_FRAME) {
            setViewScale(SMALL_SCALE);
          } else {
            setViewScale(LARGE_SCALE);
          }
        },

        onProgress: ({ framesEncoded, totalFrames }) => {
          setProgress(Math.round((framesEncoded / (totalFrames ?? 1)) * 100));
        },
      });

      setVideoUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [recorder]);

  const viewWidth = Math.round(OUTPUT_WIDTH * viewScale);
  const viewHeight = Math.round(OUTPUT_HEIGHT * viewScale);

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
                alignSelf: "center",
              }
            : { position: "absolute", left: -9999, top: -9999 }
        }
      >
        <RecordingView
          sessionId={recorder.sessionId}
          style={{ width: viewWidth, height: viewHeight }}
          pointerEvents={isRecording ? "auto" : "none"}
        >
          <ResizeContent viewWidth={viewWidth} viewHeight={viewHeight} frameIndex={currentFrame} />
        </RecordingView>
      </View>

      {/* Video result */}
      {videoUri && status === "done" && (
        <>
          <VideoOverview
            uri={videoUri}
            width={OUTPUT_WIDTH}
            height={OUTPUT_HEIGHT}
            fps={FPS}
            codec="hevc"
            totalFrames={TOTAL_FRAMES}
          />
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: colors.cardBorder,
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              The view started at {Math.round(OUTPUT_WIDTH * SMALL_SCALE)}x
              {Math.round(OUTPUT_HEIGHT * SMALL_SCALE)} and expanded to {OUTPUT_WIDTH}x
              {OUTPUT_HEIGHT} at frame {RESIZE_FRAME}. The output video dimensions ({OUTPUT_WIDTH}x
              {OUTPUT_HEIGHT}) stayed fixed throughout, so the native snapshot was scaled to fit.
            </Text>
          </View>
        </>
      )}

      {/* Status overlay */}
      {!isRecording && !(videoUri && status === "done") && (
        <View
          style={{
            width: "100%",
            aspectRatio: OUTPUT_WIDTH / OUTPUT_HEIGHT,
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
              Records {DURATION_SECONDS}s, resizing the view from{" "}
              {Math.round(OUTPUT_WIDTH * SMALL_SCALE)}x{Math.round(OUTPUT_HEIGHT * SMALL_SCALE)} to{" "}
              {OUTPUT_WIDTH}x{OUTPUT_HEIGHT} halfway through
            </Text>
          )}
        </View>
      )}

      {/* Progress */}
      {isRecording && (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            Recording... {progress}% ({viewWidth}x{viewHeight})
          </Text>
        </View>
      )}

      {/* Record button */}
      <RippleButton onPress={startRecording} disabled={isRecording} variant="primary">
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          {status === "done" ? "Record Again" : "Record & Encode"}
        </Text>
      </RippleButton>
    </View>
  );
};

function ResizeContent({
  viewWidth,
  viewHeight,
  frameIndex,
}: {
  viewWidth: number;
  viewHeight: number;
  frameIndex: number;
}) {
  const progress = frameIndex / TOTAL_FRAMES;
  const hue = 260 + progress * 100;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: `hsl(${hue}, 50%, 40%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 36, fontWeight: "800" }}>
        {viewWidth}x{viewHeight}
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.6)",
          fontSize: 16,
          fontWeight: "600",
        }}
      >
        Frame {frameIndex + 1} / {TOTAL_FRAMES}
      </Text>
    </View>
  );
}
