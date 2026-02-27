# Keep TurboModule classes
-keep class com.reactnativeimagesequenceencoder.** { *; }
-keep class com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }

# Keep the generated spec
-keep class com.reactnativeimagesequenceencoder.NativeImageSequenceEncoderSpec { *; }

# Keep ReactModule annotations
-keepattributes *Annotation*
