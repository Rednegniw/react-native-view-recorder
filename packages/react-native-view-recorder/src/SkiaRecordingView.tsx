import { useCallback, useMemo, useRef } from "react";
import { findNodeHandle, type ViewProps } from "react-native";

import NativeViewRecorder from "./NativeViewRecorder";
import {
  AbortError,
  type RecordOptions,
  resolveAudioConfig,
  runRecordingLoop,
  type ViewRecorder,
} from "./RecordingView";
import NativeRecordingView from "./RecordingViewNativeComponent";

const LINKING_ERROR =
  "react-native-view-recorder: Native module not linked.\n" +
  "Rebuild your development client or run 'bunx expo run:ios' / 'bunx expo run:android'.";

let skiaAvailable: boolean | null = null;

function checkSkia() {
  if (skiaAvailable !== null) return skiaAvailable;
  try {
    require("@shopify/react-native-skia");
    return (skiaAvailable = true);
  } catch {
    return (skiaAvailable = false);
  }
}

const SKIA_NOT_INSTALLED =
  "SkiaRecordingView requires @shopify/react-native-skia to be installed.\n" +
  "Install it with: bunx expo install @shopify/react-native-skia";

type RecordingViewRef = React.ElementRef<typeof NativeRecordingView>;

interface SkiaRecordingViewProps extends ViewProps {
  sessionId: string;
  viewRef: React.RefObject<RecordingViewRef | null>;
}

/**
 * Recording view for Skia content. Wrap your Skia Canvas children in this
 * component instead of RecordingView when recording @shopify/react-native-skia
 * canvases.
 *
 * On iOS, uses a zero-copy Metal pipeline that renders Skia directly into the
 * encoder's pixel buffers. On Android, delegates to the standard PixelCopy
 * capture path which already captures Skia content.
 */
export function SkiaRecordingView({
  sessionId,
  viewRef,
  children,
  style,
  ...props
}: SkiaRecordingViewProps) {
  if (!checkSkia()) throw new Error(SKIA_NOT_INSTALLED);

  return (
    <NativeRecordingView ref={viewRef} sessionId={sessionId} {...props} style={style}>
      {children}
    </NativeRecordingView>
  );
}

// ── Hook ───────────────────────────────────────────────────────────

let nextId = 0;

/**
 * Hook that creates a Skia view recorder session.
 * Uses captureSkiaFrame instead of captureFrame for Skia content.
 *
 * Usage:
 * ```tsx
 * const recorder = useSkiaViewRecorder();
 *
 * <SkiaRecordingView viewRef={recorder.viewRef} sessionId={recorder.sessionId}>
 *   <Canvas style={{ flex: 1 }}>
 *     <Circle cx={100} cy={100} r={50} color="red" />
 *   </Canvas>
 * </SkiaRecordingView>
 *
 * const uri = await recorder.record({ ... });
 * ```
 */
export function useSkiaViewRecorder(): ViewRecorder & {
  viewRef: React.RefObject<RecordingViewRef | null>;
} {
  const sessionIdRef = useRef<string>(`vr_${++nextId}_${Date.now()}`);
  const isRecordingRef = useRef(false);
  const stopRef = useRef(false);
  const viewRef = useRef<RecordingViewRef | null>(null);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const record = useCallback(async (options: RecordOptions): Promise<string> => {
    if (!NativeViewRecorder) throw new Error(LINKING_ERROR);
    if (isRecordingRef.current) throw new Error("A recording is already in progress.");

    if (options.signal?.aborted) {
      throw new AbortError();
    }

    if (options.codec === "hevcWithAlpha" && options.output.toLowerCase().endsWith(".mp4")) {
      throw new Error(
        "hevcWithAlpha requires .mov output. Alpha video is not supported in .mp4 containers.",
      );
    }

    if (options.audioFile && options.mixAudio) {
      throw new Error("audioFile and mixAudio cannot be combined. Use one audio source at a time.");
    }

    isRecordingRef.current = true;
    stopRef.current = false;

    const sessionId = sessionIdRef.current;
    const { onFrame, onProgress, totalFrames, signal, mixAudio, audioFile, ...restOptions } =
      options;

    const { audioSampleRate, audioChannels, nativeAudioOptions } = resolveAudioConfig(options);

    const nativeOptions = { ...restOptions, ...nativeAudioOptions };

    try {
      await NativeViewRecorder.startSession({ sessionId, ...nativeOptions });

      const viewTag = viewRef.current ? findNodeHandle(viewRef.current) : null;
      if (!viewTag) {
        throw new Error(
          "SkiaRecordingView ref is not connected. Pass recorder.viewRef as the viewRef prop on <SkiaRecordingView>.",
        );
      }

      const audioMixInfo =
        mixAudio && audioSampleRate && audioChannels
          ? { sampleRate: audioSampleRate, channels: audioChannels, fps: options.fps }
          : undefined;

      await runRecordingLoop({
        sessionId,
        captureFrame: () => NativeViewRecorder!.captureSkiaFrame(sessionId, viewTag),
        totalFrames,
        signal,
        stopRef,
        onFrame,
        onProgress,
        mixAudio,
        audioMixInfo,
      });

      return await NativeViewRecorder.finishSession(sessionId);
    } catch (error) {
      if (error instanceof AbortError) throw error;
      await NativeViewRecorder?.cancelSession(sessionId).catch(() => {});
      throw error;
    } finally {
      isRecordingRef.current = false;
      stopRef.current = false;
    }
  }, []);

  return useMemo(
    () => ({ sessionId: sessionIdRef.current, record, stop, viewRef }),
    [record, stop],
  );
}
