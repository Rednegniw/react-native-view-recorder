/**
 * React Native Video Encoder
 * --------------------------
 * Thin TypeScript facade around the native "ImageSequenceEncoder" module.
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

import NativeImageSequenceEncoder from "./NativeImageSequenceEncoder";

const LINKING_ERROR =
  "react-native-video-encoder: Native module not linked.\n" +
  "• iOS:  rebuild your development client or run 'npx expo run:ios'.\n" +
  "• Android:  rebuild your development client or run 'npx expo run:android'.";

/** Options passed to `encode()` */
export interface EncoderOptions {
  /** Directory containing the frame-PNGs. Must end with "/". */
  folder: string;
  /** Frames per second for the output file. */
  fps: number;
  /** Output video width (pixels). */
  width: number;
  /** Output video height (pixels). */
  height: number;
  /** Absolute destination path for the MP4 (will be overwritten). */
  output: string;
}

/**
 * Encode a PNG image-sequence into an MP4 and return the file URI.
 */
export async function encode(options: EncoderOptions): Promise<string> {
  if (!NativeImageSequenceEncoder) {
    throw new Error(LINKING_ERROR);
  }

  // Basic sanity check before crossing the bridge
  if (__DEV__) {
    if (!options.folder.endsWith("/")) {
      console.warn('[video-encoder] "folder" should be a directory path ending with "/".');
    }
  }

  return NativeImageSequenceEncoder.encode(options);
}

/** Convenience default export */
export default { encode };
