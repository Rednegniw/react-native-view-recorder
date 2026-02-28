# Contributing

Thanks for your interest in contributing to React Native View Recorder!

## Development Workflow

This is a Bun workspaces monorepo. To get started:

1. Fork and clone the repository
2. Run `bun install` in the root directory
3. Start the example app with `bun run example start`

### Project Structure

```
packages/react-native-view-recorder/   # The publishable library
apps/example/                          # Expo example app
docs/                                  # Documentation site
```

### Useful Commands

| Command | Description |
|---------|-------------|
| `bun run lint` | Lint the entire monorepo (Biome) |
| `bun run lint:fix` | Auto-fix lint issues |
| `bun run lib check-types` | Type-check the library |
| `bun run lib test` | Run unit tests |
| `bun run lib prepare` | Build the library (bob build) |
| `bun run example start` | Start the Expo example app |
| `bun run example ios` | Build and run the iOS example |
| `bun run example android` | Build and run the Android example |

## Native Development Setup

### iOS

- **Xcode 15+** is required
- CocoaPods is bundled with Xcode (or install via `gem install cocoapods`)
- Run `bun run example ios` to prebuild and launch on the iOS Simulator
- The library's podspec is at `packages/react-native-view-recorder/react-native-view-recorder.podspec`

### Android

- **Android Studio** with SDK 26+ (API level 26 is `minSdk`)
- **JDK 17** is required (matches `jvmTarget = '17'` in `build.gradle`)
- Run `bun run example android` to build and launch on a connected device or emulator

### Skia support

Skia integration is optional. The native code uses compile-time guards (`#if __has_include("RNSkView.h")` on iOS) so it builds fine without `@shopify/react-native-skia` installed. The example app includes Skia for testing.

### Expo Go

Expo Go does not include custom native modules. You need a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

## Modifying Native Code

- **Swift** (iOS): `packages/react-native-view-recorder/ios/`
- **Kotlin** (Android): `packages/react-native-view-recorder/android/src/main/java/com/reactnativeviewrecorder/`

The library uses the New Architecture (Fabric component + TurboModule). The codegen specs are:
- `src/NativeViewRecorder.ts` (TurboModule spec)
- `src/RecordingViewNativeComponent.ts` (Fabric component spec)

After modifying native code, rebuild the example app:

```bash
bun run example ios      # Rebuild iOS
bun run example android  # Rebuild Android
```

## Making Changes

1. Create a new branch from `main`
2. Make your changes
3. Verify everything passes: `bun run lib check-types && bun run lib lint && bun run lib test`
4. Add a changeset if your change affects the published package: `bunx changeset`

### Adding a Changeset

Run `bunx changeset` to create a changeset when your PR changes code in `packages/react-native-view-recorder/` (source, native, or config). Documentation-only changes do not need a changeset.

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code restructuring
- `docs:` for documentation changes
- `chore:` for maintenance tasks

## Pull Requests

- Keep PRs small and focused on a single concern
- Make sure CI checks pass before requesting a review
- For API changes or new features, open an issue first to discuss the approach

## Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/Rednegniw/react-native-view-recorder/issues) with as much detail as possible.

For bugs, include:
- React Native version
- Platform (iOS/Android)
- Minimal reproduction steps

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
