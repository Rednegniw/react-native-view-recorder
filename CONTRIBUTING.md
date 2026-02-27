# Contributing

Thanks for your interest in contributing to React Native Video Encoder!

## Development Workflow

This is a Bun workspaces monorepo. To get started:

1. Fork and clone the repository
2. Run `bun install` in the root directory
3. Start the example app with `bun run example start`

### Project Structure

```
packages/react-native-video-encoder/   # The publishable library
apps/example/                          # Expo example app
```

### Useful Commands

| Command | Description |
|---------|-------------|
| `bun run lib check-types` | Type-check the library |
| `bun run lib lint` | Lint with Biome |
| `bun run lib lint:fix` | Auto-fix lint issues |
| `bun run lib prepare` | Build the library (bob build) |
| `bun run example start` | Start the Expo example app |

### Making Changes

1. Create a new branch from `main`
2. Make your changes
3. Verify everything passes: `bun run lib check-types && bun run lib lint`
4. Add a changeset if your change affects the published package: `bunx changeset`

### Native Code

The library includes native iOS (Swift) and Android (Kotlin) code. If you modify native code, you'll need to rebuild the example app:

```bash
bun run example ios    # Rebuild iOS
bun run example android  # Rebuild Android
```

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

Found a bug or have a feature request? [Open an issue](https://github.com/Rednegniw/react-native-video-encoder/issues) with as much detail as possible.

For bugs, include:
- React Native version
- Platform (iOS/Android)
- Minimal reproduction steps

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
