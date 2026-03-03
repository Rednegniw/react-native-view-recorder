import { useCallback, useMemo, useRef } from "react";

import NativeViewRecorder from "./NativeViewRecorder";
import NativeRecordingView from "./RecordingViewNativeComponent";

export { NativeRecordingView as RecordingView };

const LINKING_ERROR =
  "react-native-view-recorder: Native module not linked.\n" +
  "Rebuild your development client or run 'bunx expo run:ios' / 'bunx expo run:android'.";

// ── Types ──────────────────────────────────────────────────────────

/**
 * Video codec to use for encoding.
 * Note: "hevcWithAlpha" requires .mov container (not .mp4).
 */
export type VideoCodec = "h264" | "hevc" | "hevcWithAlpha";

/**
 * Info passed to the onFrame callback before each frame capture.
 * `T` is `number` when `totalFrames` is provided, `undefined` otherwise.
 */
export interface FrameInfo<T extends number | undefined = number | undefined> {
  frameIndex: number;
  totalFrames: T;
}

/**
 * Progress info passed to the onProgress callback after each frame.
 * `T` is `number` when `totalFrames` is provided, `undefined` otherwise.
 */
export interface RecordProgress<T extends number | undefined = number | undefined> {
  framesEncoded: number;
  totalFrames: T;
}

/**
 * Options for the audioFile prop.
 */
export interface AudioFileOptions {
  /**
   * Absolute path to the audio file (WAV, MP3, AAC, M4A, etc.).
   */
  path: string;
  /**
   * Start time offset in seconds. Defaults to 0 (beginning of file).
   */
  startTime?: number;
}

/**
 * Info passed to the mixAudio callback.
 */
export interface AudioMixInfo {
  frameIndex: number;
  /**
   * Number of audio frames for this video frame.
   * Return samplesNeeded * channels interleaved values.
   */
  samplesNeeded: number;
  sampleRate: number;
  channels: number;
}

/**
 * Shared options for record(). Excludes totalFrames and callbacks,
 * which are defined in the discriminated union branches below.
 */
interface RecordOptionsBase {
  /** Absolute path for the output video file. */
  output: string;
  /** Frames per second. */
  fps: number;
  /** Output video width in pixels. Defaults to the RecordingView's rendered pixel width. */
  width?: number;
  /** Output video height in pixels. Defaults to the RecordingView's rendered pixel height. */
  height?: number;
  /**
   * Video codec. Defaults to "hevc".
   * "hevcWithAlpha" outputs .mov instead of .mp4 (alpha video is not supported in .mp4).
   */
  codec?: VideoCodec;
  /** Target bitrate in bits/second. Auto-scaled by resolution when omitted. */
  bitrate?: number;
  /**
   * Encoding quality hint from 0.0 (smallest) to 1.0 (best).
   * iOS: VBR hint applied alongside bitrate. Android: mapped to a bitrate multiplier (0.25x to 3x).
   */
  quality?: number;
  /** Seconds between keyframes. Defaults to 2. */
  keyFrameInterval?: number;
  /** Move moov atom to front for progressive playback. Defaults to true. */
  optimizeForNetwork?: boolean;
  /** AbortSignal to cancel the recording. Rejects with AbortError and deletes the partial file. */
  signal?: AbortSignal;
}

/**
 * Audio source options. Only one audio source can be used at a time:
 * either audioFile (native file muxing) or mixAudio (JS callback), but not both.
 */
type AudioSourceOptions =
  | {
      /**
       * Mux an audio file into the video. The native side decodes and muxes
       * the audio directly, bypassing the JS bridge. Supports WAV, MP3, AAC, M4A, etc.
       */
      audioFile?: AudioFileOptions;
      mixAudio?: never;
    }
  | {
      audioFile?: never;
      /**
       * Per-frame audio mixing callback. Return interleaved Float32 samples
       * for one frame's duration (samplesNeeded * channels values), or null for silence.
       * No permissions required.
       */
      mixAudio?: (info: AudioMixInfo) => Float32Array | null;
    };

/**
 * Options for the record() function.
 *
 * When `totalFrames` is provided, `onFrame` and `onProgress` receive it as `number`.
 * When omitted (event-driven mode), they receive `undefined`.
 */
export type RecordOptions = RecordOptionsBase &
  AudioSourceOptions &
  (
    | {
        /** Total number of frames to capture. */
        totalFrames: number;
        /** Called before each frame is captured. */
        onFrame?: (info: FrameInfo<number>) => void | Promise<void>;
        /** Called after each frame is captured and encoded. */
        onProgress?: (info: RecordProgress<number>) => void;
      }
    | {
        /** When omitted, recording continues until stop() is called. */
        totalFrames?: never;
        /** Called before each frame is captured. */
        onFrame?: (info: FrameInfo<undefined>) => void | Promise<void>;
        /** Called after each frame is captured and encoded. */
        onProgress?: (info: RecordProgress<undefined>) => void;
      }
  );

/**
 * Handle returned by useViewRecorder.
 */
export interface ViewRecorder {
  /**
   * Pass this as the sessionId prop on RecordingView.
   */
  sessionId: string;

  /**
   * Record the RecordingView's content to a video file.
   * Returns the output file path when done.
   */
  record: (options: RecordOptions) => Promise<string>;

  /**
   * Stop recording gracefully. The record() promise resolves
   * with the output path after the current frame finishes encoding.
   * Works for both event-driven (no totalFrames) and fixed-length recordings.
   */
  stop: () => void;
}

// ── AbortError ────────────────────────────────────────────────────

export class AbortError extends Error {
  override name = "AbortError" as const;
  constructor() {
    super("Recording was aborted");
  }
}

// ── Audio config resolution ───────────────────────────────────────

/**
 * @internal
 */
export function resolveAudioConfig(options: RecordOptions) {
  const { mixAudio, audioFile } = options;
  const hasAudio = !!mixAudio || !!audioFile;

  const audioSampleRate = hasAudio ? 44100 : undefined;
  const audioChannels = hasAudio ? 1 : undefined;
  const audioBitrate = hasAudio ? 128000 : undefined;

  const nativeAudioOptions = {
    ...(mixAudio ? { hasMixAudio: true as const } : {}),
    ...(audioFile ? { audioFilePath: audioFile.path } : {}),
    ...(audioFile?.startTime != null ? { audioFileStartTime: audioFile.startTime } : {}),
    ...(hasAudio ? { audioSampleRate, audioChannels, audioBitrate } : {}),
  };

  return { audioSampleRate, audioChannels, nativeAudioOptions };
}

// ── Base64 encoding ──────────────────────────────────────────────

// Available globally in Hermes (RN 0.74+) and Node 16+.
declare function btoa(data: string): string;

/**
 * @internal
 * Encode a Float32Array's raw bytes as a base64 string for efficient
 * bridge transfer (one string instead of N individually boxed numbers).
 */
export function float32ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// ── Shared recording loop ─────────────────────────────────────────

/**
 * @internal
 */
export interface LoopParams {
  sessionId: string;
  captureFrame: () => Promise<void>;
  totalFrames: number | undefined;
  signal: AbortSignal | undefined;
  stopRef: React.RefObject<boolean>;
  onFrame?: (info: FrameInfo) => void | Promise<void>;
  onProgress?: (info: RecordProgress) => void;
  mixAudio?: (info: AudioMixInfo) => Float32Array | null;
  audioMixInfo?: { sampleRate: number; channels: number; fps: number };
}

/**
 * @internal
 */
export async function runRecordingLoop(params: LoopParams): Promise<void> {
  const {
    sessionId,
    captureFrame,
    totalFrames,
    signal,
    stopRef,
    onFrame,
    onProgress,
    mixAudio,
    audioMixInfo,
  } = params;

  let i = 0;

  while (!stopRef.current && (totalFrames === undefined || i < totalFrames)) {
    if (signal?.aborted) {
      await NativeViewRecorder!.cancelSession(sessionId);
      throw new AbortError();
    }

    await onFrame?.({ frameIndex: i, totalFrames });

    if (mixAudio && audioMixInfo) {
      // Compute exact sample count per frame to avoid drift over long recordings
      const sampleStart = Math.floor((i * audioMixInfo.sampleRate) / audioMixInfo.fps);
      const sampleEnd = Math.floor(((i + 1) * audioMixInfo.sampleRate) / audioMixInfo.fps);
      const samplesNeeded = sampleEnd - sampleStart;

      const samples = mixAudio({
        frameIndex: i,
        samplesNeeded,
        sampleRate: audioMixInfo.sampleRate,
        channels: audioMixInfo.channels,
      });
      if (samples) {
        /**
         * Fire without awaiting so audio writes happen concurrently on the
         * native audio queue, matching the audioFile path's behavior.
         * AVAssetWriter requires both tracks to advance roughly together;
         * awaiting here would serialize them and cause a deadlock.
         */
        void NativeViewRecorder!
          .writeAudioSamples(sessionId, float32ToBase64(samples))
          .catch(() => {});
      }
    }

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await captureFrame();

    i++;
    onProgress?.({ framesEncoded: i, totalFrames });
  }
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
  const stopRef = useRef(false);

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

      const audioMixInfo =
        mixAudio && audioSampleRate && audioChannels
          ? { sampleRate: audioSampleRate, channels: audioChannels, fps: options.fps }
          : undefined;

      /**
       * Callbacks are correlated with totalFrames by the RecordOptions union,
       * but destructuring loses that correlation. Safe to widen for the internal loop.
       */
      await runRecordingLoop({
        sessionId,
        captureFrame: () => NativeViewRecorder!.captureFrame(sessionId),
        totalFrames,
        signal,
        stopRef,
        onFrame: onFrame as LoopParams["onFrame"],
        onProgress: onProgress as LoopParams["onProgress"],
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

  return useMemo(() => ({ sessionId: sessionIdRef.current, record, stop }), [record, stop]);
}
