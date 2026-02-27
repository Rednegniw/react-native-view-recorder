/**
 * React Native Video Encoder
 * --------------------------
 * Thin TypeScript facade around the native "VideoEncoder" module.
 *
 * Usage:
 *
 *   import { encode } from 'react-native-video-encoder';
 *
 *   const uri = await encode({
 *     folder:   FileSystem.cacheDirectory + 'frames/',
 *     fps:      30,
 *     width:    1280,
 *     height:   720,
 *     output:   FileSystem.documentDirectory + 'movie.mp4',
 *   });
 */

import { NativeEventEmitter, type NativeModule, Platform } from "react-native";
import NativeVideoEncoder from "./NativeVideoEncoder";

const LINKING_ERROR =
  "react-native-video-encoder: Native module not linked.\n" +
  "• iOS:  rebuild your development client or run 'npx expo run:ios'.\n" +
  "• Android:  rebuild your development client or run 'npx expo run:android'.";

/**
 * Video codec to use for encoding.
 * - `"h264"`: Maximum compatibility, larger files.
 * - `"hevc"`: ~40% smaller files at equivalent quality. Default.
 * - `"hevcWithAlpha"`: HEVC with transparency. Requires `.mov` output path.
 */
export type VideoCodec = "h264" | "hevc" | "hevcWithAlpha";

/** Progress info emitted during encoding. */
export interface EncodeProgress {
  /** Number of frames encoded so far. */
  framesEncoded: number;
  /** Total number of PNG frames found in the folder. */
  totalFrames: number;
}

/** Options passed to `encode()`. */
export interface EncoderOptions {
  /** Directory containing the frame PNGs. Must end with "/". */
  folder: string;
  /** Frames per second for the output video. */
  fps: number;
  /** Output video width in pixels. */
  width: number;
  /** Output video height in pixels. */
  height: number;
  /**
   * Absolute destination path for the encoded video.
   * Use `.mp4` for h264/hevc, `.mov` for hevcWithAlpha.
   */
  output: string;
  /**
   * Video codec. Defaults to `"hevc"` (H.265).
   * - `"h264"`: Maximum compatibility, larger files.
   * - `"hevc"`: ~40% smaller files, supported on all iOS 11+ devices.
   * - `"hevcWithAlpha"`: HEVC with transparency. Requires `.mov` output.
   */
  codec?: VideoCodec;
  /**
   * Target bitrate in bits per second. When omitted, scales
   * automatically with resolution: `width * height * fps * 0.1`.
   */
  bitrate?: number;
  /**
   * Encoding quality hint from 0.0 (smallest file) to 1.0 (best quality).
   * For `"hevcWithAlpha"`, also controls alpha channel quality.
   */
  quality?: number;
  /** Maximum interval between keyframes in seconds. Defaults to 2. */
  keyFrameInterval?: number;
  /**
   * Move the moov atom to the front of the file for progressive
   * playback over the network. Defaults to `true`.
   */
  optimizeForNetwork?: boolean;
  /** Called after each frame is encoded. */
  onProgress?: (info: EncodeProgress) => void;
}

/**
 * Encode a PNG image-sequence into an MP4 (or MOV) and return the file path.
 */
export async function encode(options: EncoderOptions): Promise<string> {
  if (!NativeVideoEncoder) {
    throw new Error(LINKING_ERROR);
  }

  // Validate folder path
  if (__DEV__) {
    if (!options.folder.endsWith("/")) {
      console.warn('[video-encoder] "folder" should be a directory path ending with "/".');
    }
  }

  // hevcWithAlpha requires .mov container
  if (options.codec === "hevcWithAlpha" && options.output.endsWith(".mp4")) {
    throw new Error(
      '[video-encoder] HEVC with alpha requires a .mov container. Change the output path extension from ".mp4" to ".mov".',
    );
  }

  const { onProgress, ...nativeOptions } = options;

  // Wire up progress events if a callback was provided
  let subscription: { remove(): void } | undefined;
  if (onProgress) {
    const emitter = new NativeEventEmitter(
      Platform.OS === "ios" ? (NativeVideoEncoder as unknown as NativeModule) : undefined,
    );
    subscription = emitter.addListener("onEncodeProgress", onProgress);
  }

  try {
    return await NativeVideoEncoder.encode(nativeOptions);
  } finally {
    subscription?.remove();
  }
}

/** Convenience default export. */
export default { encode };
