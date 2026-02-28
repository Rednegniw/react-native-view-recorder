import { useCallback, useMemo, useRef } from "react";

import NativeViewRecorder from "./NativeViewRecorder";
import NativeRecordingView from "./RecordingViewNativeComponent";

export { NativeRecordingView as RecordingView };

const LINKING_ERROR =
  "react-native-view-recorder: Native module not linked.\n" +
  "Rebuild your development client or run 'bunx expo run:ios' / 'bunx expo run:android'.";

// ── Types ──────────────────────────────────────────────────────────

/** Video codec to use for encoding. */
export type VideoCodec = "h264" | "hevc" | "hevcWithAlpha";

/** Info passed to the onFrame callback before each frame capture. */
export interface FrameInfo {
  frameIndex: number;
  totalFrames: number;
}

/** Progress info passed to the onProgress callback after each frame. */
export interface RecordProgress {
  framesEncoded: number;
  totalFrames: number;
}

/** Options for the record() function. */
export interface RecordOptions {
  /** Absolute path for the output video file. */
  output: string;

  /** Frames per second. */
  fps: number;

  /** Total number of frames to capture. */
  totalFrames: number;

  /**
   * Called before each frame is captured. Use this to update the
   * RecordingView's content for the next frame. The library waits
   * for the returned promise (if any) before capturing.
   */
  onFrame?: (info: FrameInfo) => void | Promise<void>;

  /**
   * Called after each frame is captured and encoded.
   * Use this to update a progress indicator.
   */
  onProgress?: (info: RecordProgress) => void;

  /**
   * Output video width in pixels.
   * Defaults to the RecordingView's rendered pixel width.
   */
  width?: number;

  /**
   * Output video height in pixels.
   * Defaults to the RecordingView's rendered pixel height.
   */
  height?: number;

  /** Video codec. Defaults to "hevc". */
  codec?: VideoCodec;

  /** Target bitrate in bits/second. Auto-scaled by resolution when omitted. */
  bitrate?: number;

  /** Encoding quality hint from 0.0 (smallest) to 1.0 (best). */
  quality?: number;

  /** Seconds between keyframes. Defaults to 2. */
  keyFrameInterval?: number;

  /** Move moov atom to front for progressive playback. Defaults to true. */
  optimizeForNetwork?: boolean;
}

/** Handle returned by useViewRecorder. */
export interface ViewRecorder {
  /** Pass this as the sessionId prop on RecordingView. */
  sessionId: string;

  /**
   * Record the RecordingView's content to a video file.
   * Returns the output file path when done.
   */
  record: (options: RecordOptions) => Promise<string>;
}

// ── Hook ───────────────────────────────────────────────────────────

let nextId = 0;

/**
 * Hook that creates a view recorder session.
 *
 * Usage:
 * ```tsx
 * const recorder = useViewRecorder();
 *
 * <RecordingView sessionId={recorder.sessionId} style={{ width: 640, height: 480 }}>
 *   <MyContent frame={frame} />
 * </RecordingView>
 *
 * const uri = await recorder.record({
 *   output: '/path/to/output.mp4',
 *   fps: 30,
 *   totalFrames: 150,
 *   onFrame: async ({ frameIndex }) => setFrame(frameIndex),
 * });
 * ```
 */
export function useViewRecorder(): ViewRecorder {
  const sessionIdRef = useRef<string>(`vr_${++nextId}_${Date.now()}`);
  const isRecordingRef = useRef(false);

  const record = useCallback(async (options: RecordOptions): Promise<string> => {
    if (!NativeViewRecorder) throw new Error(LINKING_ERROR);
    if (isRecordingRef.current) throw new Error("A recording is already in progress.");

    isRecordingRef.current = true;

    const sessionId = sessionIdRef.current;
    const { onFrame, onProgress, totalFrames, ...nativeOptions } = options;

    try {
      await NativeViewRecorder.startSession({ sessionId, ...nativeOptions });

      for (let i = 0; i < totalFrames; i++) {
        await onFrame?.({ frameIndex: i, totalFrames });
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await NativeViewRecorder.captureFrame(sessionId);
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

  return useMemo(() => ({ sessionId: sessionIdRef.current, record }), [record]);
}
