---
"react-native-view-recorder": minor
---

Remove `SkiaRecordingView` and `useSkiaViewRecorder` in favor of the standard `RecordingView` and `useViewRecorder`.

**Breaking:** `SkiaRecordingView`, `useSkiaViewRecorder`, and the native `captureSkiaFrame` method have been removed. Use `RecordingView` + `useViewRecorder` for Skia content instead. Add a `<Fill color="..." />` as the first child of your Skia `<Canvas>` to ensure frames don't accumulate.

**Why:** `drawHierarchy(afterScreenUpdates: true)` on iOS captures `CAMetalLayer` content correctly, making the separate Skia Metal pipeline unnecessary. On Android, `PixelCopy` already captured all view types. This simplifies the API surface and removes the native C++ Skia dependency.
