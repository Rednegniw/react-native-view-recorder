import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";
import { RippleButton } from "../components/RippleButton";
import { colors } from "../theme/colors";

const WIDTH = 640;
const HEIGHT = 480;

type Status = "idle" | "capturing" | "done" | "error";

export const SnapshotDemo = () => {
  const recorder = useViewRecorder();

  const [status, setStatus] = useState<Status>("idle");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hue, setHue] = useState(200);

  useEffect(() => {
    const id = setInterval(() => {
      setHue((prev) => (prev + 1) % 360);
    }, 50);
    return () => clearInterval(id);
  }, []);

  const takeSnapshot = useCallback(async () => {
    setStatus("capturing");
    setErrorMsg(null);
    setImageUri(null);
    setSaved(false);

    const outputFile = new File(Paths.cache, "snapshot.png");
    if (outputFile.exists) outputFile.delete();
    const outputPath = outputFile.uri.replace("file://", "");

    try {
      const result = await recorder.snapshot({
        output: outputPath,
        format: "png",
        width: WIDTH,
        height: HEIGHT,
      });

      setImageUri(result);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [recorder]);

  const saveToLibrary = useCallback(async () => {
    if (!imageUri) return;

    const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
    if (permStatus !== "granted") {
      Alert.alert("Permission needed", "Camera roll access is required to save the image.");
      return;
    }

    await MediaLibrary.saveToLibraryAsync(`file://${imageUri}`);
    setSaved(true);
  }, [imageUri]);

  const topColor = hslToHex(hue, 50, 65);
  const bottomColor = hslToHex((hue + 60) % 360, 55, 55);

  return (
    <View style={{ gap: 16 }}>
      {/* Live preview */}
      <View
        style={{
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.cardBorder,
        }}
      >
        <RecordingView
          sessionId={recorder.sessionId}
          style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
        >
          <LinearGradient
            colors={[topColor, bottomColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 48, fontWeight: "800" }}>Snapshot</Text>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 18, fontWeight: "600" }}>
              Tap the button below
            </Text>
          </LinearGradient>
        </RecordingView>
      </View>

      {/* Captured image preview */}
      {imageUri && status === "done" && (
        <View
          style={{
            borderRadius: 14,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.cardBorder,
            backgroundColor: "#111",
          }}
        >
          <Image
            source={{ uri: `file://${imageUri}` }}
            style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
            resizeMode="contain"
          />
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text
              style={{
                fontSize: 11,
                color: colors.textTertiary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                marginBottom: 2,
              }}
            >
              Captured
            </Text>
            <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>
              {WIDTH}x{HEIGHT} PNG
            </Text>
          </View>
        </View>
      )}

      {/* Error */}
      {status === "error" && (
        <View
          style={{
            backgroundColor: "#111",
            borderRadius: 14,
            padding: 20,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: colors.error, fontSize: 14, textAlign: "center" }}>{errorMsg}</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <RippleButton
          onPress={takeSnapshot}
          disabled={status === "capturing"}
          variant="primary"
          style={{ flex: 1 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {status === "capturing" ? "Capturing..." : "Take Snapshot"}
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
