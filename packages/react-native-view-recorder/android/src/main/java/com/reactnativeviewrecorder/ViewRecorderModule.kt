package com.reactnativeviewrecorder

import android.graphics.Bitmap
import android.graphics.Rect
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.PixelCopy
import android.view.Surface
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

/**
 * Session-based view recorder using PixelCopy + MediaCodec.
 *
 * PixelCopy captures from the window compositor, so it sees
 * Skia, TextureView, and SurfaceView content that Canvas-based
 * approaches (View.draw) would miss.
 */
@ReactModule(name = ViewRecorderModule.NAME)
class ViewRecorderModule(
  reactContext: ReactApplicationContext,
) : NativeViewRecorderSpec(reactContext) {
  companion object {
    const val NAME = "ViewRecorder"
    private const val TAG = "ViewRecorder"
  }

  private val sessions = ConcurrentHashMap<String, EncoderSession>()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun getName() = NAME

  override fun invalidate() {
    // Release sessions first, before canceling scope (prevents double-release
    // if a finishSession coroutine is in-flight)
    for (session in sessions.values) {
      runCatching { session.eglHandler.post { session.egl.releaseEgl() } }
      runCatching { session.encoder.release() }
      runCatching { session.muxer.release() }
      runCatching { session.inputSurface.release() }
      runCatching { session.bitmap.recycle() }
      session.callbackThread.quitSafely()
      session.eglThread.quitSafely()
    }
    sessions.clear()

    scope.cancel()
    super.invalidate()
  }

  // ── Start session ─────────────────────────────────────────────────

  override fun startSession(
    options: ReadableMap,
    promise: Promise,
  ) {
    scope.launch {
      var encoder: MediaCodec? = null
      var muxer: MediaMuxer? = null
      var inputSurface: Surface? = null
      var egl: EglWrapper? = null
      var bitmap: Bitmap? = null
      var callbackThread: HandlerThread? = null
      var eglThread: HandlerThread? = null

      try {
        val sessionId = requireNotNull(options.getString("sessionId")) { "sessionId is required" }
        val output = requireNotNull(options.getString("output")) { "output path is required" }
        val fps = options.getInt("fps")

        if (sessions.containsKey(sessionId)) {
          promise.reject("SESSION_EXISTS", "Session $sessionId already exists. Call finishSession first.")
          return@launch
        }

        val codecMime =
          resolveCodec(
            if (options.hasKey("codec") && !options.isNull("codec")) options.getString("codec") else null,
          )

        val keyFrameInterval =
          if (options.hasKey("keyFrameInterval") && !options.isNull("keyFrameInterval")) {
            options.getDouble("keyFrameInterval").toInt()
          } else {
            2
          }

        // Look up the RecordingView from the registry (optional when width/height are provided)
        val view = RecordingViewNative.registry[sessionId]?.get()

        val explicitWidth = if (options.hasKey("width") && !options.isNull("width")) options.getInt("width") else null
        val explicitHeight =
          if (options.hasKey("height") &&
            !options.isNull("height")
          ) {
            options.getInt("height")
          } else {
            null
          }

        if ((explicitWidth == null || explicitHeight == null) && view == null) {
          throw RuntimeException(
            "No RecordingView found for sessionId: $sessionId. Either mount a RecordingView with this sessionId or provide explicit width and height.",
          )
        }

        // Use pixel dimensions directly (view.width/height are already in px)
        val rawWidth = explicitWidth ?: view!!.width
        val rawHeight = explicitHeight ?: view!!.height

        // Round up to even (H.264/HEVC requirement)
        val width = (rawWidth + 1) and 1.inv()
        val height = (rawHeight + 1) and 1.inv()

        if (width <= 0 || height <= 0) {
          promise.reject(
            "INVALID_SIZE",
            "View has zero dimensions (${width}x$height). Ensure the RecordingView is laid out before recording.",
          )
          return@launch
        }

        val bitrate =
          if (options.hasKey("bitrate") && !options.isNull("bitrate")) {
            options.getInt("bitrate")
          } else {
            width * height * fps / 10
          }

        File(output).delete()

        Log.d(TAG, "Starting session $sessionId: ${width}x$height @ ${fps}fps, codec=$codecMime")

        // MediaFormat
        val format =
          MediaFormat.createVideoFormat(codecMime, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, keyFrameInterval)
          }

        // Dedicated HandlerThread for encoder callbacks
        callbackThread = HandlerThread("ViewRecorder-Callback-$sessionId").also { it.start() }
        val callbackHandler = Handler(callbackThread!!.looper)

        // Async encoder callback state
        var trackIndex = -1
        var muxerStarted = false
        val pendingBuffers = mutableListOf<Pair<ByteBuffer, MediaCodec.BufferInfo>>()
        val eosLatch = CountDownLatch(1)
        var codecError: MediaCodec.CodecException? = null

        encoder = MediaCodec.createEncoderByType(codecMime)
        muxer = MediaMuxer(output, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        encoder!!.setCallback(
          object : MediaCodec.Callback() {
            override fun onInputBufferAvailable(
              codec: MediaCodec,
              index: Int,
            ) {
              // Not called for Surface-input encoding
            }

            override fun onOutputBufferAvailable(
              codec: MediaCodec,
              index: Int,
              info: MediaCodec.BufferInfo,
            ) {
              if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                codec.releaseOutputBuffer(index, false)
                return
              }

              if (info.size > 0) {
                val buf = codec.getOutputBuffer(index)!!

                if (muxerStarted) {
                  buf.position(info.offset)
                  buf.limit(info.offset + info.size)
                  muxer!!.writeSampleData(trackIndex, buf, info)
                } else {
                  val copy = ByteBuffer.allocateDirect(info.size)
                  buf.position(info.offset)
                  buf.limit(info.offset + info.size)
                  copy.put(buf)
                  copy.flip()
                  val infoCopy = MediaCodec.BufferInfo()
                  infoCopy.set(0, info.size, info.presentationTimeUs, info.flags)
                  pendingBuffers.add(Pair(copy, infoCopy))
                }
              }

              codec.releaseOutputBuffer(index, false)

              if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                eosLatch.countDown()
              }
            }

            override fun onOutputFormatChanged(
              codec: MediaCodec,
              format: MediaFormat,
            ) {
              if (muxerStarted) return

              trackIndex = muxer!!.addTrack(format)
              muxer!!.start()
              muxerStarted = true

              for ((buf, bufInfo) in pendingBuffers) {
                muxer!!.writeSampleData(trackIndex, buf, bufInfo)
              }
              pendingBuffers.clear()

              Log.d(TAG, "Muxer started for session $sessionId")
            }

            override fun onError(
              codec: MediaCodec,
              e: MediaCodec.CodecException,
            ) {
              Log.e(TAG, "MediaCodec error in session $sessionId", e)
              codecError = e
              eosLatch.countDown()
            }
          },
          callbackHandler,
        )

        encoder!!.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = encoder!!.createInputSurface()
        encoder!!.start()

        // Dedicated HandlerThread for EGL operations (GL context is thread-bound)
        eglThread = HandlerThread("ViewRecorder-EGL-$sessionId").also { it.start() }
        val eglHandler = Handler(eglThread!!.looper)

        // Initialize EGL on its dedicated thread
        egl =
          suspendCancellableCoroutine { cont ->
            eglHandler.post {
              val wrapper = EglWrapper(inputSurface!!, width, height)
              cont.resume(wrapper)
            }
          }

        // Reusable bitmap at video dimensions (avoids per-frame allocation)
        bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        val session =
          EncoderSession(
            sessionId = sessionId,
            encoder = encoder!!,
            muxer = muxer!!,
            egl = egl!!,
            inputSurface = inputSurface!!,
            eglThread = eglThread!!,
            eglHandler = eglHandler,
            callbackThread = callbackThread!!,
            bitmap = bitmap!!,
            eosLatch = eosLatch,
            muxerStartedRef = { muxerStarted },
            codecErrorRef = { codecError },
            output = output,
            fps = fps,
            width = width,
            height = height,
          )

        sessions[sessionId] = session
        Log.d(TAG, "Session $sessionId ready")
        promise.resolve(null)
      } catch (t: Throwable) {
        Log.e(TAG, "startSession failed", t)

        if (egl != null && eglThread?.isAlive == true) {
          runCatching { Handler(eglThread!!.looper).post { egl!!.releaseEgl() } }
        }
        runCatching { encoder?.release() }
        runCatching { muxer?.release() }
        runCatching { inputSurface?.release() }
        runCatching { bitmap?.recycle() }
        callbackThread?.quitSafely()
        eglThread?.quitSafely()

        promise.reject("START_SESSION_ERROR", t.message, t)
      }
    }
  }

  // ── Capture Skia frame (Android: uses PixelCopy since Skia renders via hardware-accelerated layers) ──

  override fun captureSkiaFrame(
    sessionId: String,
    skiaViewTag: Double,
    promise: Promise,
  ) {
    val session = sessions[sessionId]

    if (session == null) {
      promise.reject("SESSION_NOT_FOUND", "No session found for sessionId: $sessionId")
      return
    }

    val activity = currentActivity

    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No current activity available")
      return
    }

    val view = RecordingViewNative.registry[sessionId]?.get()

    if (view == null) {
      promise.reject("VIEW_NOT_FOUND", "RecordingView detached for sessionId: $sessionId")
      return
    }

    activity.runOnUiThread {
      val location = IntArray(2)
      view.getLocationInWindow(location)

      val rect =
        Rect(
          maxOf(0, location[0]),
          maxOf(0, location[1]),
          minOf(activity.window.decorView.width, location[0] + view.width),
          minOf(activity.window.decorView.height, location[1] + view.height),
        )

      if (rect.width() <= 0 || rect.height() <= 0) {
        promise.reject("VIEW_NOT_VISIBLE", "RecordingView has no visible area to capture")
        return@runOnUiThread
      }

      PixelCopy.request(
        activity.window,
        rect,
        session.bitmap,
        { result ->
          if (result != PixelCopy.SUCCESS) {
            promise.reject("PIXEL_COPY_FAILED", "PixelCopy failed with result: $result")
            return@request
          }

          session.eglHandler.post {
            session.egl.drawBitmap(session.bitmap)
            session.egl.setPresentationTime(session.ptsUs * 1000)
            session.ptsUs += session.deltaUs
            session.egl.swapBuffers()
            session.frameIndex++
            promise.resolve(null)
          }
        },
        session.eglHandler,
      )
    }
  }

  // ── Capture frame ─────────────────────────────────────────────────

  override fun captureFrame(
    sessionId: String,
    promise: Promise,
  ) {
    val session = sessions[sessionId]

    if (session == null) {
      promise.reject("SESSION_NOT_FOUND", "No session found for sessionId: $sessionId")
      return
    }

    val activity = currentActivity

    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No current activity available")
      return
    }

    val view = RecordingViewNative.registry[sessionId]?.get()

    if (view == null) {
      promise.reject("VIEW_NOT_FOUND", "RecordingView detached for sessionId: $sessionId")
      return
    }

    activity.runOnUiThread {
      if (view.width <= 0 || view.height <= 0) {
        promise.reject("VIEW_NOT_VISIBLE", "RecordingView has zero dimensions")
        return@runOnUiThread
      }

      val location = IntArray(2)
      view.getLocationInWindow(location)

      val fitsInWindow =
        location[0] >= 0 &&
          location[1] >= 0 &&
          location[0] + view.width <= activity.window.decorView.width &&
          location[1] + view.height <= activity.window.decorView.height

      if (fitsInWindow) {
        // Fast path: PixelCopy reads already-composited pixels from the GPU
        val rect =
          Rect(
            location[0],
            location[1],
            location[0] + view.width,
            location[1] + view.height,
          )

        PixelCopy.request(
          activity.window,
          rect,
          session.bitmap,
          { result ->
            if (result != PixelCopy.SUCCESS) {
              promise.reject("PIXEL_COPY_FAILED", "PixelCopy failed with result: $result")
              return@request
            }

            session.eglHandler.post {
              session.egl.drawBitmap(session.bitmap)
              session.egl.setPresentationTime(session.ptsUs * 1000)
              session.ptsUs += session.deltaUs
              session.egl.swapBuffers()
              session.frameIndex++
              promise.resolve(null)
            }
          },
          session.eglHandler,
        )
      } else {
        // Fallback: View.draw() renders the full hierarchy even when the view
        // extends beyond the window (matches iOS drawHierarchy behavior)
        val bitmap = session.bitmap
        val canvas = android.graphics.Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.TRANSPARENT, android.graphics.PorterDuff.Mode.CLEAR)

        val scaleX = bitmap.width.toFloat() / view.width.toFloat()
        val scaleY = bitmap.height.toFloat() / view.height.toFloat()
        canvas.scale(scaleX, scaleY)

        view.draw(canvas)

        session.eglHandler.post {
          session.egl.drawBitmap(bitmap)
          session.egl.setPresentationTime(session.ptsUs * 1000)
          session.ptsUs += session.deltaUs
          session.egl.swapBuffers()
          session.frameIndex++
          promise.resolve(null)
        }
      }
    }
  }

  // ── Finish session ────────────────────────────────────────────────

  override fun finishSession(
    sessionId: String,
    promise: Promise,
  ) {
    val session = sessions.remove(sessionId)

    if (session == null) {
      promise.reject("SESSION_NOT_FOUND", "No session found for sessionId: $sessionId")
      return
    }

    scope.launch {
      try {
        Log.d(TAG, "Finishing session $sessionId (${session.frameIndex} frames)")

        session.encoder.signalEndOfInputStream()

        // Release EGL on its dedicated thread
        suspendCancellableCoroutine { cont ->
          session.eglHandler.post {
            session.egl.releaseEgl()
            cont.resume(Unit)
          }
        }

        val received = session.eosLatch.await(10, TimeUnit.SECONDS)

        if (!received) {
          throw RuntimeException("Encoder timed out waiting for EOS after 10 seconds")
        }

        session.codecErrorRef()?.let {
          throw RuntimeException("MediaCodec error during finalization", it)
        }

        Log.d(TAG, "EOS received for session $sessionId")

        session.encoder.stop()
        session.encoder.release()

        if (session.muxerStartedRef()) session.muxer.stop()
        session.muxer.release()

        session.inputSurface.release()
        session.bitmap.recycle()

        session.callbackThread.quitSafely()
        session.eglThread.quitSafely()

        Log.d(TAG, "Session $sessionId complete: ${session.output}")
        promise.resolve(session.output)
      } catch (t: Throwable) {
        Log.e(TAG, "finishSession failed for $sessionId", t)

        runCatching { session.eglHandler.post { session.egl.releaseEgl() } }
        runCatching { session.encoder.stop() }
        runCatching { session.encoder.release() }
        runCatching { if (session.muxerStartedRef()) session.muxer.stop() }
        runCatching { session.muxer.release() }
        runCatching { session.inputSurface.release() }
        runCatching { session.bitmap.recycle() }
        session.callbackThread.quitSafely()
        session.eglThread.quitSafely()

        promise.reject("FINISH_SESSION_ERROR", t.message, t)
      }
    }
  }
}

// ── Encoder session ───────────────────────────────────────────────

private class EncoderSession(
  val sessionId: String,
  val encoder: MediaCodec,
  val muxer: MediaMuxer,
  val egl: EglWrapper,
  val inputSurface: Surface,
  val eglThread: HandlerThread,
  val eglHandler: Handler,
  val callbackThread: HandlerThread,
  val bitmap: Bitmap,
  val eosLatch: CountDownLatch,
  val muxerStartedRef: () -> Boolean,
  val codecErrorRef: () -> MediaCodec.CodecException?,
  val output: String,
  val fps: Int,
  val width: Int,
  val height: Int,
) {
  val deltaUs = 1_000_000L / fps
  var ptsUs = 0L

  @Volatile var frameIndex = 0L
}

// ── HEVC hardware detection ───────────────────────────────────────

private fun hasHardwareHevcEncoder(): Boolean {
  val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)

  for (info in codecList.codecInfos) {
    if (!info.isEncoder) continue
    if ("video/hevc" !in info.supportedTypes) continue

    val isHardware =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        info.isHardwareAccelerated
      } else {
        !info.name.startsWith("OMX.google.") && !info.name.startsWith("c2.android.")
      }

    if (isHardware) return true
  }

  return false
}

private fun resolveCodec(userCodec: String?): String =
  when (userCodec) {
    "h264" -> "video/avc"
    "hevc" -> "video/hevc"
    "hevcWithAlpha" -> throw RuntimeException("hevcWithAlpha is only supported on iOS")
    else -> if (hasHardwareHevcEncoder()) "video/hevc" else "video/avc"
  }
