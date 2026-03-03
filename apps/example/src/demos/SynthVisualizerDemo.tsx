import { File, Paths } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";

const FPS = 60;
const TOTAL_FRAMES = 320;
const WIDTH = 640;
const HEIGHT = 480;
const NUM_BARS = 32;
const AMPLITUDE = 0.25;
const FRAMES_PER_NOTE = 20;
const ENV_FRAMES = 4;
const SMOOTHING = 0.3;
const FREQ_MIN = 230;
const FREQ_MAX = 410;
const GAUSSIAN_WIDTH = 18;

const MELODY: (number | null)[] = [
  329.63,
  329.63,
  349.23,
  392.0, // E E F G
  392.0,
  349.23,
  329.63,
  293.66, // G F E D
  261.63,
  261.63,
  293.66,
  329.63, // C C D E
  329.63,
  293.66,
  293.66,
  null, // E D D .
];

export const SynthVisualizerDemo = () => {
  const recorder = useViewRecorder();
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  const phasesRef = useRef([0, 0]);
  const barsRef = useRef<number[]>(new Array(NUM_BARS).fill(0));

  const handleRecord = useCallback(async () => {
    setRecording(true);
    setProgress(0);
    setVideoUri(null);
    phasesRef.current = [0, 0];
    barsRef.current = new Array(NUM_BARS).fill(0);

    const outputFile = new File(Paths.cache, "synth-visualizer.mp4");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    const result = await recorder.record({
      output: outputPath,
      fps: FPS,
      width: WIDTH,
      height: HEIGHT,
      totalFrames: TOTAL_FRAMES,
      optimizeForNetwork: true,

      onProgress: ({ framesEncoded, totalFrames }) => {
        setProgress(Math.round((framesEncoded / totalFrames) * 100));
      },

      mixAudio: ({ frameIndex, samplesNeeded, sampleRate }) => {
        const ni = Math.min(Math.floor(frameIndex / FRAMES_PER_NOTE), MELODY.length - 1);
        const freq = MELODY[ni]!;
        const frameInNote = frameIndex % FRAMES_PER_NOTE;
        const samples = new Float32Array(samplesNeeded);

        if (freq != null) {
          const ph = phasesRef.current;
          for (let i = 0; i < samplesNeeded; i++) {
            const t = frameInNote + i / samplesNeeded;
            let env = 1;
            if (t < ENV_FRAMES) env = t / ENV_FRAMES;
            else if (t >= FRAMES_PER_NOTE - ENV_FRAMES) env = (FRAMES_PER_NOTE - t) / ENV_FRAMES;

            const val = Math.sin(ph[0]!) + 0.3 * Math.sin(ph[1]!);
            samples[i] = (val / 1.3) * env * AMPLITUDE;
            ph[0]! += (2 * Math.PI * freq) / sampleRate;
            ph[1]! += (Math.PI * freq) / sampleRate;
          }
          ph[0] = ph[0]! % (2 * Math.PI);
          ph[1] = ph[1]! % (2 * Math.PI);
        }

        let envEnd = 1;
        const te = frameInNote + 1;
        if (te < ENV_FRAMES) envEnd = te / ENV_FRAMES;
        else if (te >= FRAMES_PER_NOTE - ENV_FRAMES) envEnd = (FRAMES_PER_NOTE - te) / ENV_FRAMES;

        const displayed = barsRef.current;
        if (freq != null) {
          const center = ((freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * (NUM_BARS - 1);
          for (let b = 0; b < NUM_BARS; b++) {
            const d = b - center;
            const target = Math.exp(-(d * d) / GAUSSIAN_WIDTH) * envEnd;
            displayed[b] = displayed[b]! + (target - displayed[b]!) * SMOOTHING;
          }
        } else {
          for (let b = 0; b < NUM_BARS; b++) {
            displayed[b] = displayed[b]! - displayed[b]! * SMOOTHING;
          }
        }

        return samples;
      },
    });

    setVideoUri(result);
    setRecording(false);
  }, [recorder]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        gap: 16,
      }}
    >
      {recording && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" }} />
          <Text style={{ color: "#FF3B30", fontSize: 12, fontWeight: "700", letterSpacing: 1 }}>
            REC {progress}%
          </Text>
        </View>
      )}

      {recording && (
        <View
          style={{
            width: "100%",
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: "#FF3B30",
          }}
        >
          <RecordingView
            sessionId={recorder.sessionId}
            style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
          >
            <View style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }} collapsable={false}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "#000",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    height: 140,
                    gap: 2,
                    width: "85%",
                  }}
                >
                  {barsRef.current.map((h, i) => (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        height: Math.max(h * 120, 4),
                        borderRadius: 3,
                        backgroundColor: "#e0e0e0",
                      }}
                    />
                  ))}
                </View>
              </View>
            </View>
          </RecordingView>
        </View>
      )}

      {videoUri && !recording && <Playback uri={videoUri} />}

      <RippleButton
        onPress={handleRecord}
        disabled={recording}
        variant="primary"
        style={{ width: "100%" }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          {videoUri && !recording ? "Record Again" : "Record"}
        </Text>
      </RippleButton>
    </View>
  );
};

function Playback({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  return (
    <View
      style={{ width: "100%", aspectRatio: WIDTH / HEIGHT, borderRadius: 16, overflow: "hidden" }}
    >
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}
