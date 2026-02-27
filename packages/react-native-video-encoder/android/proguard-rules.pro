# Keep TurboModule classes
-keep class com.reactnativevideoencoder.** { *; }
-keep class com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }

# Keep the generated spec
-keep class com.reactnativevideoencoder.NativeVideoEncoderSpec { *; }

# Keep ReactModule annotations
-keepattributes *Annotation*
