# Keep TurboModule classes
-keep class com.reactnativeviewrecorder.** { *; }
-keep class com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }

# Keep the generated spec
-keep class com.reactnativeviewrecorder.NativeViewRecorderSpec { *; }

# Keep ReactModule annotations
-keepattributes *Annotation*
