/**
 * Expo config-plugin for react-native-view-recorder.
 *
 * Usage in app.json:
 *   "plugins": ["react-native-view-recorder"]
 */

const { createRunOncePlugin } = require("expo/config-plugins");

const withViewRecorder = (config) => config;

module.exports = createRunOncePlugin(
  withViewRecorder,
  "react-native-view-recorder",
  require("../package.json").version,
);
