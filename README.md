<h1 align="center">React Native View Recorder</h1>

<p align="center">
  Record any React Native view to MP4 video. No FFmpeg, no GPL.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/react-native-view-recorder"><img src="https://img.shields.io/npm/v/react-native-view-recorder.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/react-native-view-recorder"><img src="https://img.shields.io/npm/dm/react-native-view-recorder.svg" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

## Features

- **View-level capture** - record a specific view, not the entire screen
- **Works with Skia** - captures `@shopify/react-native-skia` canvases, TextureViews, and more
- **Zero disk I/O** - frames go directly from native view capture to the hardware encoder
- **Hardware-accelerated** - AVAssetWriter (iOS) and MediaCodec (Android)
- **HEVC support** - H.264 and H.265 codecs, including HEVC with alpha (iOS)
- **Tiny footprint** - ~150 KB of native code, zero third-party binaries
- **MIT licensed** - no GPL/LGPL concerns (unlike FFmpeg-based solutions)
- **Expo-friendly** - ships with a config plugin, just add to `app.json`
- **New Architecture** - Fabric native component + TurboModule

## Compatibility

| | Minimum | Recommended |
|---|---|---|
| React Native | 0.73 | 0.83+ |
| Expo SDK | 54 | 55+ |
| iOS | 13.0 | 15.0+ |
| Android | SDK 26 (8.0) | SDK 28+ |
| Architecture | New Architecture only | |

## Installation

```bash
# Expo
npx expo install react-native-view-recorder

# npm / bun
npm install react-native-view-recorder
bun add react-native-view-recorder
```

### Expo setup

Add the plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": ["react-native-view-recorder"]
  }
}
```

Then rebuild your dev client:

```bash
npx expo run:ios
npx expo run:android
```

> Expo Go does not include custom native modules. You need a development build.

## Quick Start

```tsx
import { RecordingView, useViewRecorder } from "react-native-view-recorder";

function App() {
  const recorder = useViewRecorder();
  const [frame, setFrame] = useState(0);

  const record = async () => {
    const videoUri = await recorder.record({
      output: FileSystem.cacheDirectory + "video.mp4",
      fps: 30,
      totalFrames: 150,
      onFrame: async ({ frameIndex }) => setFrame(frameIndex),
      onProgress: ({ framesEncoded, totalFrames }) => {
        console.log(`${framesEncoded}/${totalFrames}`);
      },
    });
    console.log("Saved:", videoUri);
  };

  return (
    <RecordingView sessionId={recorder.sessionId} style={{ width: 640, height: 480 }}>
      <MyContent frame={frame} />
    </RecordingView>
  );
}
```

## Skia Support

Record Skia canvases using the dedicated `useSkiaViewRecorder` hook and `SkiaRecordingView` component:

```tsx
import { SkiaRecordingView, useSkiaViewRecorder } from "react-native-view-recorder";
import { Canvas, Circle } from "@shopify/react-native-skia";

function SkiaExample() {
  const recorder = useSkiaViewRecorder();

  return (
    <SkiaRecordingView sessionId={recorder.sessionId} viewRef={recorder.viewRef}>
      <Canvas style={{ width: 640, height: 480 }}>
        <Circle cx={320} cy={240} r={100} color="cyan" />
      </Canvas>
    </SkiaRecordingView>
  );
}
```

On iOS, Skia frames are captured via a zero-copy Metal pipeline (IOSurface to Metal texture). On Android, `PixelCopy` captures the Skia TextureView directly from the compositor.

## API

### `useViewRecorder()`

Returns a `ViewRecorder` handle:

- `sessionId` - pass to `<RecordingView>`
- `record(options)` - records all frames and returns the output path

### `useSkiaViewRecorder()`

Returns a `ViewRecorder` handle plus a `viewRef` to pass to `<SkiaRecordingView>`.

### `RecordOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | `string` | required | Absolute path for the output MP4 |
| `fps` | `number` | required | Frames per second |
| `totalFrames` | `number` | required | Total frames to capture |
| `onFrame` | `(info) => void` | - | Called before each frame. Update view content here. |
| `onProgress` | `(info) => void` | - | Called after each frame is encoded |
| `width` | `number` | view width | Output width in pixels |
| `height` | `number` | view height | Output height in pixels |
| `codec` | `"h264" \| "hevc" \| "hevcWithAlpha"` | `"hevc"` | Video codec |
| `bitrate` | `number` | auto | Target bitrate in bits/second |
| `quality` | `number` | - | 0.0 (smallest) to 1.0 (best) |
| `keyFrameInterval` | `number` | 2 | Seconds between keyframes |
| `optimizeForNetwork` | `boolean` | true | Move moov atom to front |

## Notes

1. You wrap your content in `<RecordingView>` and call `recorder.record()`
2. The library calls your `onFrame` callback, waits for React to render, then captures the native view
3. On iOS, `drawHierarchy` renders directly into a CVPixelBuffer backed by AVAssetWriter
4. On Android, `PixelCopy` captures from the window compositor into a bitmap, uploaded to MediaCodec via EGL
5. When all frames are captured, the encoder finalizes the MP4

### Platform Details

- **iOS**: AVAssetWriter with H.264/HEVC/HEVC-with-alpha. `drawHierarchy` for view capture. Minimum iOS 13.0.
- **Android**: MediaCodec with EGL/OpenGL ES 2.0. `PixelCopy` for view capture (captures Skia/TextureView). Minimum SDK 26.

## Documentation

For detailed guides on codec selection, bitrate configuration, and platform internals, see the [full documentation](https://github.com/Rednegniw/react-native-view-recorder).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
