# Comprehensive Report: react-native-view-recorder

Last updated: March 2026

## Executive Summary

`react-native-view-recorder` is a **category-defining library** in the React Native ecosystem. It is the only library that records a specific React Native view to MP4 video using hardware-accelerated native encoding, without FFmpeg, without GPL, and without full-screen capture. The implementation is technically sophisticated, the API is clean, and the documentation is production-grade for a v0.1.0 library. There are real areas for improvement, but the core proposition is strong and unmatched.

---

## 1. Competitive Landscape

### There is no direct competitor

| Library | Records a View? | Real-time? | License | Maintained? |
|---|---|---|---|---|
| **react-native-view-recorder** | **Yes** | **Yes** | **MIT** | **Active** |
| react-native-record-screen | No (full screen) | Yes | MIT | Abandoned (~2y) |
| react-native-nitro-screen-recorder | No (full screen) | Yes | MIT | Active |
| ffmpeg-kit-react-native | Needs input | No (offline) | LGPL/GPL | **Dead** (archived Jun 2025) |
| react-native-view-shot | Yes (screenshot) | No | MIT | Active |
| @azzapp/react-native-skia-video | No (video-to-video) | Partial | MIT | Beta |
| Remotion | N/A | No | Custom | Active (web only) |

Every existing screen recording library uses OS-level APIs (ReplayKit/MediaProjection) that capture the **entire screen** and require system permission prompts. The FFmpeg-based approach (ffmpeg-kit) was retired January 2025 and archived June 2025, leaving a vacuum. `react-native-view-shot` captures single frames only.

**This library occupies a completely uncontested niche**: view-level, hardware-accelerated, real-time video recording with zero external dependencies.

---

## 2. Architecture & Technical Quality

### iOS Implementation (ViewRecorder.swift, 978 lines)

**Strengths:**
- Uses `drawHierarchy(in:afterScreenUpdates:)` for standard views, which captures the full view hierarchy including blur effects, shadows, and animations
- Zero-copy Metal pipeline for Skia canvases via `CVMetalTextureCache` and `IOSurface`, meaning Skia draw commands replay directly into the encoder's pixel buffer memory with no intermediate copies
- Pixel buffer pool reuse via `AVAssetWriterInputPixelBufferAdaptor`
- Background queue for encoder readiness checks (doesn't block main thread for I/O)
- Audio file muxing runs on dedicated `audioAppendQueue` with frame-based pacing to maintain A/V interleaving
- Clean session lifecycle: start, capture, finish/cancel with proper cleanup on every error path

**Concerns:**
- `drawHierarchy` is called on the main thread (unavoidable for UIKit rendering), which means frame capture time directly impacts UI responsiveness at high FPS
- The Skia capture path (`SkiaCapture.mm`) uses runtime reflection to access `RNSkBaseAppleView` internals, which could break on Skia library updates
- Session registry uses `NSMapTable` with weak values but protected by a serial `DispatchQueue`, not an `NSLock` like the session map itself; minor inconsistency in synchronization primitives

### Android Implementation (ViewRecorderModule.kt, 853 lines)

**Strengths:**
- `PixelCopy.request()` captures from the window compositor, meaning it works with any view including hardware-accelerated layers
- EGL context on a dedicated `HandlerThread` for rendering bitmaps onto MediaCodec's input Surface
- Hardware HEVC detection with graceful fallback to H.264 (checks `isHardwareAccelerated` on API 29+, name-based heuristics for older)
- Even-dimension alignment for H.264/HEVC encoders (common source of bugs in video encoding)
- `MuxerState` class handles the MediaMuxer's deferred-start requirement cleanly (buffers samples until both audio and video format callbacks arrive)
- Coroutine-based audio file muxing with proper cancellation

**Concerns:**
- `PixelCopy` captures from the **window**, not the view, then crops. If the view is partially off-screen, it falls back to `view.draw(canvas)` which may not capture hardware-accelerated layers correctly
- The 10-second timeout on `finishSession` audio draining is hardcoded; a very long audio file could cause issues
- `Bitmap.createBitmap` is allocated per-session but reused across frames; if the view resizes mid-recording, the bitmap dimensions may not match (though the EGL pipeline may handle this)

### TypeScript Layer (RecordingView.tsx, 373 lines)

**Strengths:**
- Recording loop is elegant: `onFrame` -> `requestAnimationFrame` -> `captureFrame` -> `onProgress`, with async support at every callback
- Drift-free audio sample calculation per frame
- `AbortSignal` integration for cancellation
- Session ID generation with incrementing counter + timestamp prevents collisions
- Concurrent recording prevention via `isRecordingRef`

**Concerns:**
- The `requestAnimationFrame` between `onFrame` and `captureFrame` assumes a single RAF is sufficient for React to commit the render. In complex UIs or under load, this may not be enough
- No backpressure mechanism: if the encoder falls behind, frames keep queuing

---

## 3. API Design & Developer Experience

### Hook-based API

```tsx
const recorder = useViewRecorder();

<RecordingView sessionId={recorder.sessionId}>
  <MyContent />
</RecordingView>

const uri = await recorder.record({
  output: path,
  fps: 30,
  totalFrames: 90,
  onFrame: ({ frameIndex }) => updateContent(frameIndex),
});
```

**Assessment:** This is an excellent API. It follows modern React patterns (hooks, refs, declarative components). The `sessionId` linking mechanism between hook and component is clean and avoids ref-forwarding complexity. The `record()` function returns a promise that resolves to the output path, making it easy to compose.

### Compared to top-tier RN library APIs

| Aspect | react-native-view-recorder | react-native-reanimated | @shopify/react-native-skia | expo-camera |
|---|---|---|---|---|
| Hook pattern | `useViewRecorder()` | `useSharedValue()` | `useCanvasRef()` | `useCameraPermissions()` |
| Component wrapper | `<RecordingView>` | `<Animated.View>` | `<Canvas>` | `<CameraView>` |
| Promise-based | Yes | N/A | N/A | Yes |
| TypeScript types | Complete | Complete | Complete | Complete |
| Error classes | `AbortError` | N/A | N/A | `CameraError` |

The API sits comfortably alongside the best libraries in the ecosystem. It's intuitive, strongly typed, and follows established conventions.

### Skia Integration

The separate `useSkiaViewRecorder()` hook and `SkiaRecordingView` component cleanly separate the optional Skia dependency. Runtime detection (`@shopify/react-native-skia` is lazily checked) means the library works without Skia installed.

### Audio API

Two audio paths are provided:
- **`audioFile`**: Native file muxing (zero JS overhead, supports WAV/MP3/AAC/M4A)
- **`mixAudio`**: Per-frame JS callback for programmatic audio generation

These are mutually exclusive (enforced with a clear error message). This is a well-designed split between common and advanced use cases.

---

## 4. Documentation Quality

### Structure

12 .mdx files across 4 sections:
- Getting Started (installation, quick start)
- API Reference (5 pages, one per export)
- Guides (internals, codec selection)
- Examples (standard + Skia with video previews)

### Assessment

**Strengths:**
- Every public API has its own documentation page with props tables and code examples
- Platform-specific behavior (iOS vs Android) is transparently documented
- The "How it Works" guide explains the recording pipeline at a level useful to contributors
- Multiple installation methods (Expo, npm, bun, yarn, pnpm)
- Codec selection guide with practical recommendations

**Gaps:**
- No troubleshooting/FAQ page
- No performance tuning guide (e.g., "what FPS can I expect on device X")
- No explicit discussion of limitations (main thread capture, RAF assumptions)
- No migration guide (acceptable for v0.1.0)

**Compared to best-in-class:** The documentation is on par with well-established libraries like `react-native-reanimated` for API coverage, though it lacks the interactive examples and community-contributed guides that mature libraries accumulate over time.

---

## 5. Testing

### Coverage

4 test suites, ~750 lines:
- `exports.test.ts`: Verifies all public exports
- `useViewRecorder.test.ts` (552 lines): Comprehensive happy path, callbacks, edge cases, concurrency, error handling, abort signal, audio
- `useSkiaViewRecorder.test.ts`: Skia-specific capture path
- `NativeViewRecorder.test.ts`: TurboModule registration

### Assessment

**Strengths:**
- The JS recording logic is thoroughly tested (concurrent recording prevention, abort signal, error cleanup, audio mutual exclusivity, container validation for hevcWithAlpha)
- Tests validate the contract between JS and native (correct arguments to `startSession`, `captureFrame`, `finishSession`)
- Edge cases are covered (totalFrames=0, pre-aborted signal, mixAudio + audioFile conflict)

**Gaps:**
- No native unit tests (Swift/Kotlin). The native encoding logic is ~2,000 lines of untested code.
- No integration tests (e.g., actually recording a view and verifying the output file)
- No performance benchmarks
- Jest mocks are comprehensive but necessarily shallow (mocked `requestAnimationFrame` is synchronous)

**Compared to best-in-class:** Libraries like `react-native-reanimated` and `react-native-screens` also primarily test JS logic with mocked native modules. Integration testing for native RN modules is notoriously difficult. The JS test coverage here is above average for the ecosystem.

---

## 6. Build & Distribution

| Aspect | Status | Notes |
|---|---|---|
| Build tool | react-native-builder-bob | Industry standard for RN libraries |
| Output | ESM module + TypeScript declarations | Correct for modern RN |
| Codegen | Fabric + TurboModule (New Architecture) | Required for RN 0.73+ |
| Expo plugin | No-op pass-through | Clean, no unnecessary config |
| Podspec | iOS 13.0+, Swift 5.0, C++17 | Appropriate minimums |
| Gradle | Min SDK 26, Target SDK 34, Java 17 | Current and appropriate |
| Linting | Biome | Modern, fast |
| Package exports | Properly configured `exports` field | Source, RN, types, default |

This is a textbook setup. No issues.

---

## 7. Strengths

1. **Unique positioning**: Only library that records a specific view (not full screen) to MP4 with hardware-accelerated encoding
2. **Zero external dependencies**: No FFmpeg, no GPL, no large binaries
3. **Skia zero-copy pipeline**: The Metal/IOSurface path on iOS is genuinely impressive engineering
4. **Clean API**: Hook + component pattern that feels native to React
5. **Audio support**: Both file-based and programmatic audio, with proper interleaving
6. **Thorough JS tests**: 550+ lines covering the recording orchestration logic
7. **Documentation**: Production-grade for a v0.1.0
8. **Modern stack**: New Architecture required, Biome, TypeScript strict mode, ESM output

---

## 8. Weaknesses & Risks

1. **Main thread capture**: `drawHierarchy` (iOS) and the rendering portion of the pipeline run on the main thread. At 60fps, this will cause visible jank in the running app on mid-range devices. No documentation warns about this.

2. **Single RAF assumption**: The recording loop assumes one `requestAnimationFrame` is sufficient for React to commit a render after `onFrame`. Under heavy load or with Suspense, this may not hold, causing stale frames.

3. **Skia runtime reflection**: `SkiaCapture.mm` accesses `RNSkBaseAppleView` internals via reflection. Any refactor in `@shopify/react-native-skia` could silently break this. No CI validation against Skia updates.

4. **No native tests**: ~2,000 lines of Swift/Kotlin with zero unit tests. Encoder configuration, pixel buffer management, audio interleaving, and thread synchronization are all untested at the native level.

5. **Pre-1.0 maturity**: v0.1.0 signals the API may change. No changelog, no release cadence established.

6. **No backpressure**: If the hardware encoder can't keep up with the capture rate, frames queue unboundedly. No mechanism to drop frames or slow down.

7. **Android PixelCopy limitations**: When a view extends beyond the window bounds, the fallback to `view.draw(canvas)` may not capture hardware-accelerated layers (video, GL, camera previews).

8. **No performance guidance**: The docs don't discuss expected FPS on different devices, memory usage, or thermal throttling considerations.

---

## 9. Edge Cases

| Scenario | Current behavior | Recommendation |
|----------|-----------------|----------------|
| View unmounts during recording | Error thrown ("view_not_found") | Document. Consider allowing recording with explicit width/height when view unmounts. |
| App backgrounds during recording | Fails (drawHierarchy/PixelCopy can't run) | Document. Consider lifecycle listener to pause/resume. |
| Rapid start/stop cycles | Mitigated by single-threaded encoder callbacks | Adequate. |
| Memory pressure on large dimensions | No pool size limits or dimension validation | Add dimension caps or warnings. |
| 4K@60fps bitrate overflow | `width * height * fps / 10` overflows Int32 | Use 64-bit arithmetic on both platforms. |

---

## 10. Feature Gaps

| Feature | Priority | Notes |
|---------|----------|-------|
| Mic/app audio capture | Medium | AVAudioEngine/AudioRecord + ReplayKit/MediaProjection |
| Pause/resume | Medium | Requires encoder session persistence |
| Reanimated integration | Low | Drive animations frame-by-frame for export |
| GIF output | Low | Different encoder entirely |
| Web support (WebCodecs) | Low | Would expand platform reach significantly |

---

## 11. Overall Rating

| Category | Score | Notes |
|---|---|---|
| **Usefulness** | 9/10 | Fills a genuine, uncontested gap in the RN ecosystem |
| **Code Quality** | 8/10 | Sophisticated native code, clean TS, minor thread-safety concerns |
| **API Design** | 9/10 | Modern, intuitive, strongly typed, composable |
| **Documentation** | 8/10 | Comprehensive API docs, missing perf/troubleshooting guides |
| **Testing** | 6/10 | Strong JS coverage, zero native tests |
| **DX** | 8/10 | Easy to install, easy to use, good error messages |
| **Ecosystem Fit** | 10/10 | No competition whatsoever |
| **Production Readiness** | 6/10 | Pre-1.0, no native tests, untested at scale |

### Bottom Line

This is a technically impressive library solving a real problem that no one else has solved in the React Native ecosystem. The API design and documentation quality suggest a developer who has studied the best libraries closely. The main risks are around production hardening: native test coverage, performance at scale, and the fragility of the Skia reflection bridge. For its intended use case (recording animations, generating shareable video content from RN views), it is the only game in town, and it's built well.
