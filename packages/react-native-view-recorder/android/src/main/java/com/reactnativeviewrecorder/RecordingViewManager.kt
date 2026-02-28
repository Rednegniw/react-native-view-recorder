package com.reactnativeviewrecorder

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp

@ReactModule(name = RecordingViewManager.REACT_CLASS)
class RecordingViewManager : ViewGroupManager<RecordingViewNative>() {

  companion object {
    const val REACT_CLASS = "RecordingView"
  }

  override fun getName() = REACT_CLASS

  override fun createViewInstance(context: ThemedReactContext) = RecordingViewNative(context)

  @ReactProp(name = "sessionId")
  fun setSessionId(view: RecordingViewNative, sessionId: String?) {
    view.sessionId = sessionId ?: ""
  }
}
