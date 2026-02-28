# react-native-view-recorder

## What this project is

Record any React Native view to MP4 video. Captures views (including Skia canvases) frame-by-frame using native APIs (drawHierarchy on iOS, PixelCopy on Android) and encodes with hardware-accelerated H.264/HEVC (AVAssetWriter on iOS, MediaCodec on Android). No FFmpeg, no GPL.

## Monorepo structure

Bun workspaces monorepo:
- **`packages/react-native-view-recorder/`** - The publishable library (Turbo Module + native component with Expo config plugin)
- **`apps/example/`** - Expo SDK 55 example app (RN 0.83)

## Reference project

Use `/Users/antoninwingender/Projects/number-flow-react-native` as reference for package structure, monorepo conventions, and patterns.

## Instructions
- Always use `bunx` instead of `npx` for running commands (e.g. `bunx expo install`, `bunx tsc`).
- NEVER revert files via Git commands (`git checkout`, `git restore`, `git reset`, `git stash`). If you need to undo changes, edit the files manually.
