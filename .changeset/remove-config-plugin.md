---
"react-native-view-recorder": minor
---

Remove no-op Expo config plugin. The library does not require any native project modifications beyond autolinking, so the plugin was unnecessary. If you have `"react-native-view-recorder"` in your app.json plugins array, simply remove it.
