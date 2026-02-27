# react-native-video-encoder

## What this project is

An on-device PNG-sequence to MP4 encoder for React Native and Expo. No FFmpeg, no GPL. Uses platform video encoders (AVAssetWriter on iOS, MediaCodec on Android) via a Turbo Module.

## Monorepo structure

Bun workspaces monorepo:
- **`packages/react-native-video-encoder/`** - The publishable library (Turbo Module with Expo config plugin)
- **`apps/example/`** - Expo SDK 55 example app (RN 0.83)

## Reference project

Use `/Users/antoninwingender/Projects/number-flow-react-native` as reference for package structure, monorepo conventions, and patterns.

## Instructions
- Always use `bunx` instead of `npx` for running commands (e.g. `bunx expo install`, `bunx tsc`).
- NEVER revert files via Git commands (`git checkout`, `git restore`, `git reset`, `git stash`). If you need to undo changes, edit the files manually.
