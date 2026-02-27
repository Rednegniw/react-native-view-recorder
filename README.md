<h1 align="center">React Native Video Encoder</h1>

<p align="center">
  On-device PNG-to-MP4 encoder for React Native and Expo. No FFmpeg, no GPL.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/react-native-video-encoder"><img src="https://img.shields.io/npm/v/react-native-video-encoder.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/react-native-video-encoder"><img src="https://img.shields.io/npm/dm/react-native-video-encoder.svg" alt="npm downloads" /></a>
  <a href="https://github.com/Rednegniw/react-native-video-encoder/actions/workflows/ci.yml"><img src="https://github.com/Rednegniw/react-native-video-encoder/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

## Features

- **Offline** - runs entirely on the device, no network upload required
- **Tiny footprint** - ~150 KB of native code, zero third-party binaries
- **MIT licensed** - no GPL/LGPL concerns (unlike FFmpeg-based solutions)
- **Expo-friendly** - ships with a config plugin, just add to `app.json`
- **New Architecture** - TurboModule support out of the box
- **Cross-platform** - iOS (AVAssetWriter) and Android (MediaCodec + EGL)

## Installation

```bash
# Expo
npx expo install react-native-video-encoder

# npm / bun
npm install react-native-video-encoder
# or
bun add react-native-video-encoder
```

### Expo setup

Add the plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": ["react-native-video-encoder"]
  }
}
```

Then rebuild your dev client:

```bash
npx expo run:ios
# or
npx expo run:android
```

> **Note:** Expo Go does not include custom native modules. You need a development build.

### Bare React Native

iOS:
```bash
cd ios && pod install
```

Android autolinking handles setup automatically.

## Quick Start

```ts
import { encode } from "react-native-video-encoder";
import * as FileSystem from "expo-file-system";

// Assuming you have frames at /cache/frames/frame_00000.png, frame_00001.png, ...
const uri = await encode({
  folder: FileSystem.cacheDirectory + "frames/",
  fps: 60,
  width: 1280,
  height: 720,
  output: FileSystem.cacheDirectory + "video.mp4",
});

console.log("MP4 saved at", uri);
```

## API

### `encode(options): Promise<string>`

Encodes a directory of sequential PNG frames into an H.264 MP4 video.

| Option   | Type     | Description                                                  |
| -------- | -------- | ------------------------------------------------------------ |
| `folder` | `string` | Directory containing PNG frames. Must end with `/`.          |
| `fps`    | `number` | Frames per second in the output video.                       |
| `width`  | `number` | Output width in pixels. Must be even.                        |
| `height` | `number` | Output height in pixels. Must be even.                       |
| `output` | `string` | Absolute file path for the output MP4 (overwritten if exists). |

Returns the absolute file path of the saved MP4.

## Troubleshooting

| Problem                                    | Fix                                                                |
| ------------------------------------------ | ------------------------------------------------------------------ |
| **Native module not linked**               | Rebuild your dev client (`npx expo run:ios` / `run:android`).      |
| **`INFO_OUTPUT_FORMAT_CHANGED` (Android)** | Use even dimensions (e.g. 1280x720). Some encoders reject odd sizes. |

## Platform Details

- **iOS**: Uses `AVAssetWriter` with H.264 codec (AVFoundation). Minimum iOS 13.0.
- **Android**: Uses `MediaCodec` with EGL/OpenGL ES 2.0 for bitmap-to-surface rendering. Minimum SDK 21.

## Attribution

Originally based on work by [Elliot Fleming](https://github.com/elliotfleming).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
