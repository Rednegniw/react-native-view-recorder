# react-native-view-recorder

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
