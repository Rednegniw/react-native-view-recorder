<h1 align="center">React Native View Recorder</h1>

<p align="center" style="font-size: 1.2em;">
  Capture any React Native View to a video or an image. Add your own audio. Ideal for creating shareable content in your apps.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/react-native-view-recorder"><img src="https://img.shields.io/npm/v/react-native-view-recorder" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/react-native-view-recorder"><img src="https://img.shields.io/npm/dm/react-native-view-recorder" alt="npm downloads" /></a>
  <a href="https://github.com/Rednegniw/react-native-view-recorder/actions/workflows/ci.yml"><img src="https://github.com/Rednegniw/react-native-view-recorder/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Rednegniw/react-native-view-recorder/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/react-native-view-recorder" alt="license" /></a>
</p>

<div align="center">
  <video src="https://github.com/user-attachments/assets/69095d1e-0855-441e-9afb-5b98b39fd100" width="300"></video>
</div>

## Features

- **View-level capture**: record a specific view, not the entire screen
- **Works with Skia**: captures `@shopify/react-native-skia` canvases and TextureViews
- **Hardware-accelerated**: AVAssetWriter on iOS, MediaCodec on Android
- **Audio support**: mux audio files or generate samples per-frame via JS callback
- **HEVC support**: H.264, H.265, and HEVC with alpha (iOS)
- **Tiny footprint**: ~90 KB of native code, zero third-party binaries
- **MIT licensed**: no GPL/LGPL concerns (unlike FFmpeg-based solutions)
- **Expo config plugin**: just add to `app.json`
- **New Architecture**: Fabric native component + TurboModule

## Documentation

For full docs, examples, and API reference, visit **[react-native-view-recorder.awingender.com](https://react-native-view-recorder.awingender.com)**.

## Installation

```bash
# expo
npx expo install react-native-view-recorder

# npm
npm install react-native-view-recorder

# bun
bun add react-native-view-recorder
```

For Expo, add the config plugin to your `app.json`:

```json
{
  "expo": {
    "plugins": ["react-native-view-recorder"]
  }
}
```

> Expo Go does not support native modules. You need a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

## Quick start

```tsx
import { useState } from "react";
import { Button, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import { RecordingView, useViewRecorder } from "react-native-view-recorder";

export default function App() {
  const recorder = useViewRecorder();
  const [frame, setFrame] = useState(0);

  const handleRecord = async () => {
    await recorder.record({
      output: FileSystem.cacheDirectory + "video.mp4",
      fps: 30,
      totalFrames: 150,
      onFrame: async ({ frameIndex }) => setFrame(frameIndex),
    });
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <RecordingView
        sessionId={recorder.sessionId}
        style={{ width: 300, height: 200, backgroundColor: "#111" }}
      >
        <Text style={{ color: "#fff", fontSize: 48 }}>{frame}</Text>
      </RecordingView>

      <Button title="Record 5s" onPress={handleRecord} />
    </View>
  );
}
```

## Skia support

Record Skia canvases using `useSkiaViewRecorder` and `SkiaRecordingView`:

```tsx
import { SkiaRecordingView, useSkiaViewRecorder } from "react-native-view-recorder";
import { Canvas, Circle } from "@shopify/react-native-skia";

function SkiaExample() {
  const recorder = useSkiaViewRecorder();

  return (
    <SkiaRecordingView sessionId={recorder.sessionId} viewRef={recorder.viewRef}>
      <Canvas style={{ width: 300, height: 300 }}>
        <Circle cx={150} cy={150} r={100} color="cyan" />
      </Canvas>
    </SkiaRecordingView>
  );
}
```

## Sponsoring

If this library helps you, particularly if you are a big company, consider [sponsoring me](https://github.com/sponsors/Rednegniw). Helps a ton, thank you!

## License

MIT
