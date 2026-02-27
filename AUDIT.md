# react-native-video-encoder: State-of-the-Art Audit

## Executive Summary

The library's **architecture is fundamentally sound**: AVAssetWriter on iOS, MediaCodec + Surface-based OpenGL on Android. These are the correct APIs for the job. However, the implementation has several areas where it leaves performance and quality on the table, and the API surface is limited compared to what modern platform APIs can offer.

**Overall grade: B-** - Correct foundation, but with meaningful room for improvement in performance, quality control, and feature completeness.

---

## iOS Implementation (ImageSequenceEncoder.swift)

### What's Good
- **AVAssetWriter is the right API.** It internally uses VTCompressionSession and automatically routes through Apple's hardware Media Engine. No need for lower-level VideoToolbox.
- **CVPixelBufferPool via the adaptor.** Reuses IOSurface-backed pixel buffers rather than allocating per frame. This is the correct pattern.
- **autoreleasepool per frame.** Prevents ObjC memory spikes from UIImage/CGImage temporaries.
- **Background thread execution.** `.userInitiated` QoS is appropriate.
- **32BGRA pixel format.** Correct choice for CGImage source data; the hardware encoder handles YUV conversion internally.

### Issues and Improvements

| Issue | Severity | Detail |
|-------|----------|--------|
| **Spinlock backpressure** (line 153) | Medium | `while !input.isReadyForMoreMediaData { usleep(2_000) }` is a busy-wait spinlock. Apple's recommended pattern is `requestMediaDataWhenReady(on:using:)`, which is a pull-based callback that pauses naturally without wasting CPU cycles. |
| **Hardcoded 3 Mbps bitrate** (line 99) | High | 3 Mbps is quite low. For 1080p@30fps, Apple recommends ~10 Mbps for H.264. For 720p it's reasonable, but the bitrate should scale with resolution or be user-configurable. |
| **H.264 only** (line 95) | Medium | HEVC (H.265) has been available since iOS 11 (2017). Every device since iPhone 7 has hardware HEVC encoding. HEVC produces ~40% smaller files at equivalent quality. Should be offered as an option. |
| **No progress callback** | Medium | For long sequences, the JS side has no visibility into encoding progress. A frame-count callback via `RCTEventEmitter` or a bridge callback would be useful. |
| **Semaphore for finishWriting** (line 164-168) | Low | Works correctly but blocks the GCD thread. An async continuation or callback-based approach would be more idiomatic modern Swift. |
| **Silent frame skip on decode failure** (line 131) | Medium | If a PNG fails to load, the frame is silently skipped, creating a timing gap in the video. Should either error out or at least warn. |
| **No `shouldOptimizeForNetworkUse`** | Low | Setting `writer.shouldOptimizeForNetworkUse = true` moves the moov atom to the start of the file, enabling progressive playback. One-liner. |
| **CGColorSpace created per frame** (line 146) | Low | `CGColorSpaceCreateDeviceRGB()` is called inside the loop. Should be hoisted outside. Minor allocation overhead. |

### Available but Unused iOS Features
- **HEVC with alpha** (`AVVideoCodecType.hevcWithAlpha`, iOS 13+) - encode transparent video
- **HDR encoding** (HEVC Main10 profile, HLG/PQ transfer functions)
- **ProRes profiles** (4444, 422HQ, etc.) - for professional workflows
- **Fragmented MP4 output** (`outputFileTypeProfile`, iOS 14+) - for streaming
- **MV-HEVC / spatial video** (iOS 17.2+) - for Vision Pro

---

## Android Implementation (ImageSequenceEncoderModule.kt + EglWrapper.kt)

### What's Good
- **Surface-based encoding** with `createInputSurface()`. This is the gold standard for image-to-video on Android. Avoids the "color format hell" of ByteBuffer mode where every SoC vendor uses different YUV formats.
- **OpenGL ES 2.0 rendering pipeline.** Correct approach for getting bitmap pixels onto the encoder's input Surface via GPU.
- **Non-blocking drain during encoding.** Periodically pulls encoded data from the encoder without blocking frame submission.
- **Coroutine on Dispatchers.IO.** Appropriate for this CPU/IO-bound work.
- **Safety limit on final drain** (1000 iterations). Prevents infinite loops.

### Issues and Improvements

| Issue | Severity | Detail |
|-------|----------|--------|
| **Texture created/destroyed per frame** (EglWrapper.kt:113-149) | High | `glGenTextures` + `GLUtils.texImage2D` + `glDeleteTextures` every single frame. Should create one texture once in `init`, then call `GLUtils.texImage2D` to update its contents per frame. This is a significant GPU overhead reduction. |
| **Missing `EGL_RECORDABLE_ANDROID`** (EglWrapper.kt:58-65) | Medium | The EGL config selection does not include `EGL_RECORDABLE_ANDROID = EGL14.EGL_TRUE`. This attribute signals the EGL implementation that the surface targets a video encoder. Some devices may fall back to suboptimal buffer formats without it. |
| **Hardcoded 10 Mbps bitrate** (line 82) | Medium | Better than iOS's 3 Mbps but still not resolution-aware. Should scale with resolution or be configurable. Also inconsistent with iOS (3 Mbps vs 10 Mbps for the same content). |
| **I-frame interval of 1** (line 88) | Low | Every frame is a keyframe. Produces larger files with minimal quality benefit for a PNG-sequence use case. 2-5 seconds is more typical. Configurable would be best. |
| **No progress callback** | Medium | Same as iOS: no way for JS to know encoding progress. |
| **Bitmap decoded at original size** (line 113) | Medium | `BitmapFactory.decodeFile` loads the full PNG. If the source image is larger than the target dimensions, this wastes memory. Should use `BitmapFactory.Options.inSampleSize` or `inScaled` for downsampling. |
| **No `BitmapFactory.Options` tuning** (line 113) | Low | Could set `inPreferredConfig = Bitmap.Config.ARGB_8888` explicitly and `inMutable = false` for clarity. |
| **Synchronous MediaCodec mode** | Low | The library uses synchronous `dequeueOutputBuffer`. Async callback mode (API 21+) can reduce polling overhead, though for this batch processing use case the difference is modest. |
| **Leaked CoroutineScope** (line 33) | Low | `CoroutineScope(Dispatchers.IO).launch` creates an unstructured scope. If the module is destroyed mid-encode, the coroutine continues. Should use `reactContext.addLifecycleEventListener` or a `SupervisorJob` with cancellation. |
| **Excessive Log.w usage** | Low | Production code should use `Log.d` (debug) not `Log.w` (warning). |
| **`files` includes non-PNG files** (line 73) | Low | Unlike iOS which filters `.hasSuffix(".png")`, Android sorts all files in the directory. Non-image files will cause `BitmapFactory.decodeFile` to return null. |
| **No HEVC option** | Medium | Same as iOS. HEVC hardware encoding is available on most flagships (Snapdragon 8xx, Exynos, Tensor, Dimensity). Should be offered with runtime capability checking via `MediaCodecList`. |

### ANGLE Migration Note
Android 15+ is transitioning OpenGL ES to run atop Vulkan via ANGLE. The library's GL ES 2.0 usage should continue to work, but testing on Android 15 devices is advisable since ANGLE is becoming the default driver on 2025+ devices.

---

## TypeScript API Surface

### Current API
```typescript
interface EncoderOptions {
  folder: string;
  fps: number;
  width: number;
  height: number;
  output: string;
}
encode(options: EncoderOptions): Promise<string>
```

### Missing Options (Compared to What Platform APIs Support)

| Option | Description | Difficulty |
|--------|-------------|------------|
| `codec` | `"h264"` or `"hevc"` | Low |
| `bitrate` | Custom bitrate in bps | Low |
| `quality` | Quality preset (low/medium/high/lossless) | Low |
| `keyframeInterval` | Seconds between keyframes | Low |
| `onProgress` | Callback with `{ framesEncoded, totalFrames }` | Medium |
| `optimizeForNetwork` | Move moov atom to front | Low (iOS only) |
| `filePattern` | Glob pattern for frames (e.g., `"*.png"`, `"*.jpg"`) | Low |

---

## Cross-Platform Inconsistencies

| Aspect | iOS | Android |
|--------|-----|---------|
| **Bitrate** | 3 Mbps | 10 Mbps |
| **I-frame interval** | Default (encoder decides) | 1 second (every frame is a keyframe) |
| **File filtering** | `.png` only | All files in directory |
| **Frame skip behavior** | Silent skip | Logs warning, returns from lambda |
| **Error granularity** | `"encode_error"` | `"ENCODER_ERROR"` |

These should be harmonized for consistent cross-platform behavior.

---

## Competitive Landscape

The timing for this library is excellent:

- **FFmpegKit is dead.** The most popular FFmpeg wrapper for RN was retired January 2025. Binary artifacts removed from CocoaPods/Maven. No successor has emerged.
- **No Turbo Module encoding library with traction exists.** `react-native-compressor` supports Turbo Modules but only does video re-compression, not image-to-video.
- **The closest competitor** (`react-native-image-sequence-encoder`) has ~61 downloads/month and 1 star.
- **react-native-skia-video** is interesting but in "very unstable" beta.
- **Media3 Transformer** (Android) is powerful but designed for transcoding existing media, not batch bitmap encoding.

---

## Priority Recommendations

### High Impact, Low Effort
1. **Reuse OpenGL texture on Android** - Create texture once, update with `texImage2D` per frame. Significant GPU win.
2. **Add `EGL_RECORDABLE_ANDROID`** to EGL config. One line.
3. **Harmonize bitrates** across platforms. Make resolution-aware (e.g., `width * height * fps * 0.1` as a baseline).
4. **Add `shouldOptimizeForNetworkUse = true`** on iOS. One line.
5. **Filter non-PNG files on Android** like iOS does.

### High Impact, Medium Effort
6. **Add HEVC codec option** with runtime capability checking.
7. **Use `requestMediaDataWhenReady`** on iOS instead of spinlock.
8. **Add progress callback** via `RCTEventEmitter` or bridge events.
9. **Make bitrate, keyframe interval, codec configurable** in the TypeScript API.
10. **Decode bitmaps at target size on Android** using `BitmapFactory.Options.inSampleSize`.

### Nice-to-Have (Future)
11. HEVC with alpha support (transparent video)
12. Audio track muxing (combine with an audio file)
13. JPEG input support (not just PNG)
14. Cancellation support (abort mid-encode)
15. Published benchmarks (nobody else in the RN ecosystem has these)


If you wanted to expand the library's value, a higher-leverage direction would be something like a streaming API where you push
  pixel data frame-by-frame without the intermediate PNG-to-disk step. That would eliminate the I/O bottleneck (encoding PNGs to
  disk just to decode them again on the native side) and work with any capture source. But that's a much bigger architectural
  change.