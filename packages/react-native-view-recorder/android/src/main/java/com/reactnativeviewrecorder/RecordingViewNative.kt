package com.reactnativeviewrecorder

import android.content.Context
import com.facebook.react.views.view.ReactViewGroup
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap

class RecordingViewNative(
  context: Context,
) : ReactViewGroup(context) {
  companion object {
    val registry = ConcurrentHashMap<String, WeakReference<RecordingViewNative>>()
  }

  var sessionId: String = ""
    set(value) {
      if (field.isNotEmpty()) registry.remove(field)
      field = value
      if (value.isNotEmpty()) registry[value] = WeakReference(this)
    }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (sessionId.isNotEmpty()) registry[sessionId] = WeakReference(this)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    if (sessionId.isNotEmpty()) registry.remove(sessionId)
  }
}
