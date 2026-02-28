/**
 * Expo config-plugin for react-native-view-recorder.
 *
 * The native module lives in ios/ and android/ and will be autolinked
 * by React Native once the prebuild step runs.
 *
 * We still expose a plugin so Expo-managed users can add:
 *
 *   "plugins": ["react-native-view-recorder"]
 *
 * in their app.json. This keeps the dependency tree explicit and lets us
 * add future build-time tweaks without breaking apps.
 */

const { createRunOncePlugin } = require("expo/config-plugins");

const withViewRecorder = (config) => config; // nothing to patch (yet)

module.exports = createRunOncePlugin(
  withViewRecorder,
  "react-native-view-recorder",
  require("../package.json").version,
);
