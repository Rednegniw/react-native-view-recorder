package com.reactnativevideoencoder

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModuleList
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

@ReactModuleList(
  nativeModules = [
    VideoEncoderModule::class,
  ]
)
class VideoEncoderPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == VideoEncoderModule.NAME) {
      VideoEncoderModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      mapOf(
        VideoEncoderModule.NAME to ReactModuleInfo(
          VideoEncoderModule.NAME,
          VideoEncoderModule.NAME,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // hasConstants
          false, // isCxxModule
          isTurboModule
        )
      )
    }
  }
}
