import { File } from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { colors } from "../theme/colors";

interface VideoOverviewProps {
  uri: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
  totalFrames: number;
  bitrate?: number;
  label?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBitrate(bps: number): string {
  if (bps < 1_000_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

function formatCodec(codec: string): string {
  switch (codec) {
    case "h264":
      return "H.264";
    case "hevc":
      return "HEVC";
    case "hevcWithAlpha":
      return "HEVC+Alpha";
    default:
      return codec.toUpperCase();
  }
}

export const VideoOverview = ({
  uri,
  width,
  height,
  fps,
  codec,
  totalFrames,
  bitrate,
  label,
}: VideoOverviewProps) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  const { fileSize, duration, displayBitrate } = useMemo(() => {
    const fileUri = uri.startsWith("file://") ? uri : `file://${uri}`;
    const file = new File(fileUri);
    const size = file.size ?? 0;
    const dur = totalFrames / fps;
    const br = bitrate ?? (dur > 0 ? (size * 8) / dur : 0);
    return { fileSize: size, duration: dur, displayBitrate: br };
  }, [uri, totalFrames, fps, bitrate]);

  return (
    <View
      style={{
        backgroundColor: "#111",
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.cardBorder,
      }}
    >
      {/* Label */}
      {label && (
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
        </View>
      )}

      {/* Video playback */}
      <View
        style={{
          aspectRatio: width / height,
          backgroundColor: "#000",
          ...(!label ? { borderTopLeftRadius: 14, borderTopRightRadius: 14 } : {}),
        }}
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          nativeControls={false}
        />
      </View>

      {/* Metadata grid */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          paddingHorizontal: 14,
          paddingVertical: 12,
          gap: 4,
        }}
      >
        <MetadataItem label="Resolution" value={`${width}x${height}`} />
        <MetadataItem label="Duration" value={`${duration.toFixed(1)}s`} />
        <MetadataItem label="File Size" value={formatFileSize(fileSize)} />
        <MetadataItem label="Bitrate" value={formatBitrate(displayBitrate)} />
        <MetadataItem label="Codec" value={formatCodec(codec)} />
        <MetadataItem label="FPS" value={`${fps}`} />
      </View>
    </View>
  );
};

const MetadataItem = ({ label, value }: { label: string; value: string }) => (
  <View style={{ width: "30%", marginBottom: 8 }}>
    <Text
      style={{
        fontSize: 11,
        color: colors.textTertiary,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        marginBottom: 2,
      }}
    >
      {label}
    </Text>
    <Text style={{ fontSize: 15, color: colors.text, fontWeight: "600" }}>{value}</Text>
  </View>
);
