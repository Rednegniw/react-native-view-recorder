import { forwardRef, useCallback, useMemo, useRef } from "react";
import { findNodeHandle, type ViewProps } from "react-native";

import NativeViewRecorder from "./NativeViewRecorder";
import type { RecordOptions, ViewRecorder } from "./RecordingView";
import NativeRecordingView from "./RecordingViewNativeComponent";

const LINKING_ERROR =
  "react-native-view-recorder: Native module not linked.\n" +
  "Rebuild your development client or run 'bunx expo run:ios' / 'bunx expo run:android'.";

type RecordingViewRef = React.ElementRef<typeof NativeRecordingView>;

interface SkiaRecordingViewProps extends ViewProps {
  sessionId: string;
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
export const SkiaRecordingView = forwardRef<RecordingViewRef, SkiaRecordingViewProps>(
  ({ sessionId, children, style, ...props }, ref) => (
    <NativeRecordingView ref={ref} sessionId={sessionId} {...props} style={style}>
      {children}
    </NativeRecordingView>
  ),
);

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
 * <SkiaRecordingView sessionId={recorder.sessionId}>
 *   <Canvas style={{ flex: 1 }}>
 *     <Circle cx={100} cy={100} r={50} color="red" />
 *   </Canvas>
 * </SkiaRecordingView>
 *
 * const uri = await recorder.record({ ... });
 * ```
 */
export function useSkiaViewRecorder(): ViewRecorder & {
  skiaViewRef: React.RefObject<RecordingViewRef | null>;
} {
  const sessionIdRef = useRef<string>(`vr_${++nextId}_${Date.now()}`);
  const isRecordingRef = useRef(false);
  const skiaViewRef = useRef<RecordingViewRef | null>(null);

  const record = useCallback(async (options: RecordOptions): Promise<string> => {
    if (!NativeViewRecorder) throw new Error(LINKING_ERROR);
    if (isRecordingRef.current) throw new Error("A recording is already in progress.");

    isRecordingRef.current = true;

    const sessionId = sessionIdRef.current;
    const { onFrame, onProgress, totalFrames, ...nativeOptions } = options;

    try {
      await NativeViewRecorder.startSession({ sessionId, ...nativeOptions });

      // Get the native view tag for the Skia view
      const viewTag = skiaViewRef.current ? findNodeHandle(skiaViewRef.current) : null;

      for (let i = 0; i < totalFrames; i++) {
        await onFrame?.({ frameIndex: i, totalFrames });
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        if (viewTag) {
          await NativeViewRecorder.captureSkiaFrame(sessionId, viewTag);
        } else {
          await NativeViewRecorder.captureFrame(sessionId);
        }

        onProgress?.({ framesEncoded: i + 1, totalFrames });
      }

      return await NativeViewRecorder.finishSession(sessionId);
    } catch (error) {
      await NativeViewRecorder?.finishSession(sessionId).catch(() => {});
      throw error;
    } finally {
      isRecordingRef.current = false;
    }
  }, []);

  return useMemo(() => ({ sessionId: sessionIdRef.current, record, skiaViewRef }), [record]);
}
