package com.reactnativeviewrecorder

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModuleList
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

@ReactModuleList(nativeModules = [ViewRecorderModule::class])
class ViewRecorderPackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext,
  ): NativeModule? = if (name == ViewRecorderModule.NAME) ViewRecorderModule(reactContext) else null

  override fun getReactModuleInfoProvider() =
    ReactModuleInfoProvider {
      val isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      mapOf(
        ViewRecorderModule.NAME to
          ReactModuleInfo(
            ViewRecorderModule.NAME,
            ViewRecorderModule.NAME,
            false,
            false,
            false,
            false,
            isTurboModule,
          ),
      )
    }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(RecordingViewManager())
}
