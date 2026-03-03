# Audit

Last updated: March 2026

## Ecosystem Position

No other React Native library records a specific view (not full screen) to video using native hardware-accelerated encoding. Every existing solution falls short:

| Library | What it does | Limitation |
|---------|-------------|------------|
| `react-native-view-shot` (2.9k stars, 508k dl/wk) | Screenshots a specific view | Images only. Maintainer explicitly declined video support. |
| `react-native-record-screen` (164 stars) | Records full screen via ReplayKit/MediaProjection | Cannot target a specific view. Requires system permission dialogs. Old Architecture only. |
| `react-native-nitro-screen-recorder` (68 stars) | Records full screen via ReplayKit/MediaProjection | Cannot target a specific view. Alpha quality. |
| `@azzapp/react-native-skia-video` (140 stars, 4.3k dl/wk) | Skia video compositing | Skia-only, designed for video editing, not view recording. Self-described "unstable beta." |

The common workaround (rapid screenshots with `react-native-view-shot` + FFmpeg stitching) adds 15-30MB bundle size, has GPL licensing issues, isn't real-time, and produces inconsistent frame rates.

## Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Ecosystem positioning | 10/10 | Fills a real gap, no direct competitors |
| API design | 8/10 | Clean and idiomatic, needs cancellation and event-driven mode |
| TypeScript | 10/10 | Zero `as any`, proper types throughout |
| iOS native | 9/10 | Excellent zero-copy Metal/AVAssetWriter pipeline |
| Android native | 8.5/10 | Strong MediaCodec/EGL pipeline, minor parity gaps |
| Tests | 7/10 | Good unit coverage, no integration or edge case tests |
| Documentation | 7.5/10 | Good start, needs limitations section and troubleshooting |
| Feature completeness | 7/10 | Core is solid, has cancel/event-driven/mixAudio, missing mic/app audio capture |
| Build and packaging | 9.5/10 | Proper bob setup, codegen, Expo plugin |

**Overall: 8.4/10**

## API Design

Strengths:
- Hook-based API (`useViewRecorder`, `useSkiaViewRecorder`) feels idiomatic React
- Session-based architecture allows multiple recorders
- `onFrame` with async support gives full control over per-frame content
- `onProgress` separated from `onFrame` (clean concerns)
- Good defaults (HEVC codec, auto bitrate, moov atom optimization)

Issues:
- **`quality` is iOS-only.** Android silently ignores it. Should be documented or throw/warn.

## iOS Native (9/10)

Strengths:
- Thread-safe session management with `NSLock`
- Zero-copy pipeline: CVPixelBuffer backed by IOSurface goes directly to AVAssetWriter
- Skia Metal pipeline (`SkiaCapture.mm`): finds Skia's GrDirectContext via reflection, creates Metal texture from CVPixelBuffer, wraps as Skia SkSurface, renders directly with no intermediate copies
- Proper Y-axis flip and coordinate transforms
- Good codec validation (hevcWithAlpha requires .mov)
- Even-dimension rounding for H.264/HEVC

Issues:
- Busy-wait loop checking `input.isReadyForMoreMediaData` with 5ms sleep. A `DispatchSemaphore` would be cleaner.
- Static `CVMetalTextureCacheRef` in SkiaCapture.mm is never released. Minor leak on module unload.
- `skiaViewTag` parameter sent from JS is unused on the native side (view found from registry instead). Dead parameter in the TurboModule spec.

## Android Native (8.5/10)

Strengths:
- Hardware-accelerated MediaCodec with async callback state machine
- Dedicated EGL context for texture upload (correct GL threading)
- Smart fallback: `PixelCopy` when view is in window, `View.draw()` otherwise
- HEVC hardware detection with both API level and codec name heuristics
- Clean resource cleanup with `runCatching {}`

Issues:
- 10-second hardcoded EOS timeout. On slow devices or very long recordings, this could fire prematurely.
- `quality` parameter silently ignored (iOS accepts it).
- No file extension validation (iOS validates `.mov` for hevcWithAlpha, Android doesn't validate `.mp4`).
- `hevcWithAlpha` throws at runtime rather than at the TypeScript level. Could guard earlier.
- Bitrate auto-calculation (`width * height * fps / 10`) could overflow for 4K@60fps. Use `Long` arithmetic.

## Tests (7/10)

Covered:
- Hook identity and session management
- Full recording happy path (callback ordering)
- Async callback handling
- Concurrent recording prevention
- Native module linking errors
- Error handling and cleanup
- Exports verification

Missing:
- Integration tests with actual native modules
- View unmounting during recording
- App backgrounding during recording
- Performance/stress tests for large dimensions or long recordings

## Documentation (7.5/10)

Good:
- Clear feature list, compatibility matrix, quick start
- API reference table
- Skia section with platform details
- "How it works" technical overview

Missing:
- **Limitations section.** Should explicitly state: no mic/app audio capture, no streaming output, hevcWithAlpha is iOS-only, quality param is iOS-only.
- **Troubleshooting guide.** Common errors (module not linked, view not found, backgrounding) need guidance.
- **Performance guidance.** Recommended bitrates for common resolutions, max practical dimensions, memory usage per session.

## Edge Cases

| Scenario | Current behavior | Recommendation |
|----------|-----------------|----------------|
| View unmounts during recording | Error thrown ("view_not_found") | Document. Consider allowing recording with explicit width/height when view unmounts. |
| App backgrounds during recording | Fails (drawHierarchy/PixelCopy can't run) | Document. Consider lifecycle listener to pause/resume. |
| Rapid start/stop cycles | Mitigated by single-threaded encoder callbacks | Adequate. |
| Memory pressure on large dimensions | No pool size limits or dimension validation | Add dimension caps or warnings. |
| 4K@60fps bitrate overflow | `width * height * fps / 10` overflows Int32 | Use 64-bit arithmetic on both platforms. |

## Feature Gaps

| Feature | Priority | Notes |
|---------|----------|-------|
| Mic/app audio capture | Medium | AVAudioEngine/AudioRecord + ReplayKit/MediaProjection (removed, needs reliable implementation) |
| Pause/resume | Medium | Requires encoder session persistence |
| Reanimated integration | Low | Drive animations frame-by-frame for export |
| GIF output | Low | Different encoder entirely |
| Web support (WebCodecs) | Low | Would expand platform reach significantly |

## Risks

1. **New Architecture only** limits adoption. Many production apps haven't migrated. Reasonable tradeoff for a new library, but will slow initial uptake.
2. **JS-driven frame loop.** Each frame round-trips through JS (onFrame -> state update -> RAF -> native capture). This caps practical FPS to JS thread throughput. A native-driven capture mode would unlock high-FPS use cases.
3. **No app lifecycle handling.** Backgrounding mid-recording produces unhelpful errors with no recovery path.
