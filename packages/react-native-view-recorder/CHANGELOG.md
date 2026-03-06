# react-native-view-recorder

## 0.3.1

### Patch Changes

- [`7bfbf17`](https://github.com/Rednegniw/react-native-view-recorder/commit/7bfbf1778464282b1f456ea7d2cd054e94d10e82) Thanks [@Rednegniw](https://github.com/Rednegniw)! - Add demo video to README

## 0.3.0

### Minor Changes

- [`8b4e503`](https://github.com/Rednegniw/react-native-view-recorder/commit/8b4e5039d5cde83ff6bb0381bbe441639608c227) Thanks [@Rednegniw](https://github.com/Rednegniw)! - Add snapshot/photo capture: `recorder.snapshot()` captures a single frame from a RecordingView as a PNG or JPEG image. Supports file output and base64, custom dimensions, and works independently of video recording. Also available as a standalone `takeSnapshot()` function.

## 0.2.0

### Minor Changes

- [`6644ed9`](https://github.com/Rednegniw/react-native-view-recorder/commit/6644ed9322541200e5a45e4331c56028c6e52615) Thanks [@Rednegniw](https://github.com/Rednegniw)! - Remove `SkiaRecordingView` and `useSkiaViewRecorder` in favor of the standard `RecordingView` and `useViewRecorder`.

  **Breaking:** `SkiaRecordingView`, `useSkiaViewRecorder`, and the native `captureSkiaFrame` method have been removed. Use `RecordingView` + `useViewRecorder` for Skia content instead. Add a `<Fill color="..." />` as the first child of your Skia `<Canvas>` to ensure frames don't accumulate.

  **Why:** `drawHierarchy(afterScreenUpdates: true)` on iOS captures `CAMetalLayer` content correctly, making the separate Skia Metal pipeline unnecessary. On Android, `PixelCopy` already captured all view types. This simplifies the API surface and removes the native C++ Skia dependency.

## 0.1.1

### Patch Changes

- [`742234d`](https://github.com/Rednegniw/react-native-view-recorder/commit/742234d83ac71414fa16ac9705ee909f64ce39ac) Thanks [@Rednegniw](https://github.com/Rednegniw)! - Initial public release

## 0.1.0

Initial release.
