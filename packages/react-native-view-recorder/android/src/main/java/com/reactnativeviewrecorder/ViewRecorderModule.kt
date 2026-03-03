package com.reactnativeviewrecorder

import android.app.Activity
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
import kotlin.math.pow

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

  private fun releaseSession(session: EncoderSession) {
    session.audioStopped = true
    runCatching { session.audioEncoder?.stop() }
    runCatching { session.audioEncoder?.release() }
    runCatching { session.eglHandler.post { session.egl.releaseEgl() } }
    runCatching { session.encoder.stop() }
    runCatching { session.encoder.release() }
    runCatching { if (session.muxerState.started) session.muxer.stop() }
    runCatching { session.muxer.release() }
    runCatching { session.inputSurface.release() }
    runCatching { session.bitmap.recycle() }
    session.callbackThread.quitSafely()
    session.eglThread.quitSafely()
  }

  override fun invalidate() {
    for (session in sessions.values) {
      releaseSession(session)
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
      var audioEncoderInst: MediaCodec? = null

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

        val view = RecordingViewNative.registry[sessionId]?.get()

        val explicitWidth = if (options.hasKey("width") && !options.isNull("width")) options.getInt("width") else null
        val explicitHeight =
          if (options.hasKey("height") && !options.isNull("height")) options.getInt("height") else null

        if ((explicitWidth == null || explicitHeight == null) && view == null) {
          throw RuntimeException(
            "No RecordingView found for sessionId: $sessionId. Either mount a RecordingView with this sessionId or provide explicit width and height.",
          )
        }

        val rawWidth = explicitWidth ?: view!!.width
        val rawHeight = explicitHeight ?: view!!.height
        val width = (rawWidth + 1) and 1.inv()
        val height = (rawHeight + 1) and 1.inv()

        if (width <= 0 || height <= 0) {
          promise.reject(
            "INVALID_SIZE",
            "View has zero dimensions (${width}x$height). Ensure the RecordingView is laid out before recording.",
          )
          return@launch
        }

        val baseBitrate = width.toLong() * height * fps / 10

        val bitrate: Int =
          if (options.hasKey("bitrate") && !options.isNull("bitrate")) {
            options.getInt("bitrate")
          } else if (options.hasKey("quality") && !options.isNull("quality")) {
            val q = options.getDouble("quality").coerceIn(0.0, 1.0)
            val multiplier = 0.25 + 2.75 * q.pow(1.5)
            (baseBitrate * multiplier).toInt()
          } else {
            baseBitrate.toInt()
          }

        File(output).delete()

        val wantMixAudio = options.hasKey("hasMixAudio") && options.getBoolean("hasMixAudio")
        val audioFilePath = if (options.hasKey("audioFilePath") && !options.isNull("audioFilePath"))
          options.getString("audioFilePath") else null
        val audioFileStartTime = if (options.hasKey("audioFileStartTime") && !options.isNull("audioFileStartTime"))
          options.getDouble("audioFileStartTime") else 0.0
        val hasAnyAudio = wantMixAudio || audioFilePath != null

        val audioSampleRate = if (options.hasKey("audioSampleRate") && !options.isNull("audioSampleRate"))
          options.getInt("audioSampleRate") else 44100
        val audioChannels = if (options.hasKey("audioChannels") && !options.isNull("audioChannels"))
          options.getInt("audioChannels") else 1
        val audioBitrate = if (options.hasKey("audioBitrate") && !options.isNull("audioBitrate"))
          options.getInt("audioBitrate") else 128000

        Log.d(TAG, "Starting session $sessionId: ${width}x$height @ ${fps}fps, codec=$codecMime")

        // Video encoder + muxer setup
        callbackThread = HandlerThread("ViewRecorder-Callback-$sessionId").also { it.start() }
        val callbackHandler = Handler(callbackThread!!.looper)

        val eosLatch = CountDownLatch(1)
        var codecError: MediaCodec.CodecException? = null

        encoder = MediaCodec.createEncoderByType(codecMime)
        muxer = MediaMuxer(output, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        val muxerState = MuxerState(muxer!!, expectedTrackCount = if (hasAnyAudio) 2 else 1)

        val videoFormat = MediaFormat.createVideoFormat(codecMime, width, height).apply {
          setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
          setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
          setInteger(MediaFormat.KEY_FRAME_RATE, fps)
          setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, keyFrameInterval)
        }

        encoder!!.setCallback(
          object : MediaCodec.Callback() {
            override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {}

            override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
              if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                codec.releaseOutputBuffer(index, false)
                return
              }

              if (info.size > 0) {
                val buf = codec.getOutputBuffer(index)!!
                muxerState.writeOrBuffer(buf, info, isAudio = false)
              }

              codec.releaseOutputBuffer(index, false)

              if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                eosLatch.countDown()
              }
            }

            override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
              muxerState.registerTrack(format, isAudio = false)
              if (muxerState.started) Log.d(TAG, "Muxer started for session $sessionId")
            }

            override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
              Log.e(TAG, "MediaCodec error in session $sessionId", e)
              codecError = e
              eosLatch.countDown()
            }
          },
          callbackHandler,
        )

        encoder!!.configure(videoFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = encoder!!.createInputSurface()
        encoder!!.start()

        eglThread = HandlerThread("ViewRecorder-EGL-$sessionId").also { it.start() }
        val eglHandler = Handler(eglThread!!.looper)

        egl = suspendCancellableCoroutine { cont ->
          eglHandler.post {
            val wrapper = EglWrapper(inputSurface!!, width, height)
            cont.resume(wrapper)
          }
        }

        bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        // Audio encoder for mixAudio/audioFile: synchronous mode (no setCallback).
        if (hasAnyAudio) {
          val audioFormat = MediaFormat.createAudioFormat(
            MediaFormat.MIMETYPE_AUDIO_AAC, audioSampleRate, audioChannels,
          ).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, audioBitrate)
          }

          audioEncoderInst = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
          audioEncoderInst!!.configure(audioFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
          audioEncoderInst!!.start()
        }

        val session = EncoderSession(
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
          codecErrorRef = { codecError },
          output = output,
          fps = fps,
          width = width,
          height = height,
          audioEncoder = audioEncoderInst,
          muxerState = muxerState,
          audioFilePath = audioFilePath,
          audioFileStartTime = audioFileStartTime,
          audioSampleRate = audioSampleRate,
          audioChannels = audioChannels,
        )

        sessions[sessionId] = session

        /** Start audio file muxing concurrently with video frame capture. */
        if (audioFilePath != null) {
          scope.launch {
            try {
              muxAudioFile(session)
            } finally {
              session.audioFileLatch.countDown()
            }
          }
        }

        Log.d(TAG, "Session $sessionId ready")
        promise.resolve(null)
      } catch (t: Throwable) {
        Log.e(TAG, "startSession failed", t)

        // Remove partially-stored session
        val sid = runCatching { options.getString("sessionId") }.getOrNull()
        if (sid != null) sessions.remove(sid)

        runCatching { audioEncoderInst?.stop() }
        runCatching { audioEncoderInst?.release() }
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

  // ── Capture Skia frame ──────────────────────────────────────────

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

      val rect = Rect(
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
        activity.window, rect, session.bitmap,
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
        val rect = Rect(
          location[0], location[1],
          location[0] + view.width, location[1] + view.height,
        )

        PixelCopy.request(
          activity.window, rect, session.bitmap,
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

        // Unblock the audio muxing thread's pacing loop and wait for it to finish
        session.audioFileMaxDurationUs = session.frameIndex * session.deltaUs
        session.audioFileLatch.await(10, TimeUnit.SECONDS)

        session.audioStopped = true

        session.audioEncoder?.let { aEnc ->
          val idx = aEnc.dequeueInputBuffer(10_000)
          if (idx >= 0) {
            aEnc.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
          }
          session.drainAudioOutput()
        }

        session.encoder.signalEndOfInputStream()

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

        releaseSession(session)

        Log.d(TAG, "Session $sessionId complete: ${session.output}")
        promise.resolve(session.output)
      } catch (t: Throwable) {
        Log.e(TAG, "finishSession failed for $sessionId", t)
        releaseSession(session)
        promise.reject("FINISH_SESSION_ERROR", t.message, t)
      }
    }
  }

  // ── Cancel session ──────────────────────────────────────────────

  override fun cancelSession(
    sessionId: String,
    promise: Promise,
  ) {
    val session = sessions.remove(sessionId)
    if (session == null) {
      promise.resolve(null)
      return
    }

    scope.launch {
      Log.d(TAG, "Cancelling session $sessionId")
      releaseSession(session)
      File(session.output).delete()
      Log.d(TAG, "Session $sessionId cancelled")
      promise.resolve(null)
    }
  }

  // ── Audio file muxing ───────────────────────────────────────────

  /**
   * Decodes an audio file via MediaExtractor and feeds PCM data to the audio
   * encoder. Paces itself against video frames to keep audio/video interleaved.
   * Called from a background coroutine started in startSession.
   */
  private fun muxAudioFile(session: EncoderSession) {
    val audioEncoder = session.audioEncoder ?: return
    val filePath = session.audioFilePath ?: return

    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(filePath)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to open audio file: $filePath", e)
      return
    }

    // Find the audio track
    var trackIndex = -1
    for (i in 0 until extractor.trackCount) {
      val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith("audio/")) { trackIndex = i; break }
    }
    if (trackIndex < 0) {
      Log.w(TAG, "No audio track found in: $filePath")
      extractor.release()
      return
    }

    extractor.selectTrack(trackIndex)
    val format = extractor.getTrackFormat(trackIndex)
    val fileSampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    val fileChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    // PCM16: 2 bytes per sample per channel
    val bytesPerFrame = 2 * fileChannels

    val startTimeUs = (session.audioFileStartTime * 1_000_000).toLong()
    if (startTimeUs > 0) {
      extractor.seekTo(startTimeUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
    }

    // Use a large initial buffer; grow if a sample exceeds it
    var readBuffer = ByteBuffer.allocate(65536)
    var audioTimeUs = 0L

    try {
      while (!session.audioStopped) {
        val maxDurationUs = session.audioFileMaxDurationUs
        if (maxDurationUs >= 0 && audioTimeUs >= maxDurationUs) break

        // Pace: wait if audio is >1s ahead of video (only while recording is active)
        if (maxDurationUs < 0) {
          val videoTimeUs = session.frameIndex * session.deltaUs
          while (audioTimeUs > videoTimeUs + 1_000_000 && !session.audioStopped && session.audioFileMaxDurationUs < 0) {
            Thread.sleep(10)
          }
        }

        // Grow buffer if the next sample is larger
        val neededSize = extractor.sampleSize.toInt()
        if (neededSize > readBuffer.capacity()) {
          readBuffer = ByteBuffer.allocate(neededSize)
        }

        readBuffer.clear()
        val sampleSize = extractor.readSampleData(readBuffer, 0)
        if (sampleSize < 0) break

        // Feed to encoder, splitting across input buffers if needed
        var offset = 0
        while (offset < sampleSize && !session.audioStopped) {
          val encIdx = audioEncoder.dequeueInputBuffer(5_000)
          if (encIdx < 0) { session.drainAudioOutput(); continue }

          val encBuf = audioEncoder.getInputBuffer(encIdx)!!
          encBuf.clear()
          val toWrite = minOf(sampleSize - offset, encBuf.remaining())
          readBuffer.position(offset)
          readBuffer.limit(offset + toWrite)
          encBuf.put(readBuffer)
          audioEncoder.queueInputBuffer(encIdx, 0, toWrite, audioTimeUs, 0)

          val samplesWritten = toWrite.toLong() / bytesPerFrame
          audioTimeUs += samplesWritten * 1_000_000 / fileSampleRate
          offset += toWrite

          session.drainAudioOutput()
        }

        extractor.advance()
      }
    } catch (e: Exception) {
      Log.e(TAG, "Audio file muxing failed", e)
    } finally {
      extractor.release()
    }
  }

  // ── Write audio samples (for mixAudio callback) ─────────────────

  override fun writeAudioSamples(
    sessionId: String,
    samples: ReadableArray,
    promise: Promise,
  ) {
    val session = sessions[sessionId]
    if (session == null) {
      promise.reject("SESSION_NOT_FOUND", "No session found for sessionId: $sessionId")
      return
    }

    val audioEncoder = session.audioEncoder
    if (audioEncoder == null) {
      promise.reject("NO_AUDIO", "No audio encoder configured for session $sessionId")
      return
    }

    val sampleCount = samples.size()
    if (sampleCount == 0) {
      promise.resolve(null)
      return
    }

    scope.launch {
      try {
        val pcmBytes = ByteArray(sampleCount * 2)
        for (i in 0 until sampleCount) {
          val sample = samples.getDouble(i).toFloat().coerceIn(-1f, 1f)
          val pcm16 = (sample * 32767).toInt().toShort()
          pcmBytes[i * 2] = (pcm16.toInt() and 0xFF).toByte()
          pcmBytes[i * 2 + 1] = (pcm16.toInt() shr 8 and 0xFF).toByte()
        }

        val inputIndex = audioEncoder.dequeueInputBuffer(10_000)
        if (inputIndex >= 0) {
          val inputBuffer = audioEncoder.getInputBuffer(inputIndex)!!
          inputBuffer.clear()
          inputBuffer.put(pcmBytes)

          // PTS = current video frame time (writeAudioSamples is called before captureFrame)
          val ptsUs = session.ptsUs
          audioEncoder.queueInputBuffer(inputIndex, 0, pcmBytes.size, ptsUs, 0)
        }

        session.drainAudioOutput()
        promise.resolve(null)
      } catch (t: Throwable) {
        Log.e(TAG, "writeAudioSamples failed", t)
        promise.reject("AUDIO_WRITE_ERROR", t.message, t)
      }
    }
  }
}

// ── Muxer state (thread-safe track registration + deferred start) ──

private class MuxerState(
  val muxer: MediaMuxer,
  val expectedTrackCount: Int,
) {
  private val lock = Any()
  private var registeredTrackCount = 0
  private val pendingVideoBuffers = mutableListOf<Pair<ByteBuffer, MediaCodec.BufferInfo>>()
  private val pendingAudioBuffers = mutableListOf<Pair<ByteBuffer, MediaCodec.BufferInfo>>()

  var videoTrackIndex = -1
    private set
  var audioTrackIndex = -1
    private set
  @Volatile var started = false
    private set

  fun registerTrack(format: MediaFormat, isAudio: Boolean) {
    synchronized(lock) {
      if (started) return
      val idx = muxer.addTrack(format)
      if (isAudio) audioTrackIndex = idx else videoTrackIndex = idx
      registeredTrackCount++
      if (registeredTrackCount == expectedTrackCount) {
        muxer.start()
        started = true
        for ((buf, info) in pendingVideoBuffers) muxer.writeSampleData(videoTrackIndex, buf, info)
        pendingVideoBuffers.clear()
        for ((buf, info) in pendingAudioBuffers) muxer.writeSampleData(audioTrackIndex, buf, info)
        pendingAudioBuffers.clear()
      }
    }
  }

  fun writeOrBuffer(buf: ByteBuffer, info: MediaCodec.BufferInfo, isAudio: Boolean) {
    synchronized(lock) {
      val trackIdx = if (isAudio) audioTrackIndex else videoTrackIndex
      if (started && trackIdx >= 0) {
        buf.position(info.offset)
        buf.limit(info.offset + info.size)
        muxer.writeSampleData(trackIdx, buf, info)
      } else {
        val copy = ByteBuffer.allocateDirect(info.size)
        buf.position(info.offset)
        buf.limit(info.offset + info.size)
        copy.put(buf)
        copy.flip()
        val infoCopy = MediaCodec.BufferInfo()
        infoCopy.set(0, info.size, info.presentationTimeUs, info.flags)
        (if (isAudio) pendingAudioBuffers else pendingVideoBuffers).add(Pair(copy, infoCopy))
      }
    }
  }
}

// ── Drain audio encoder (synchronous mode) ────────────────────────

private fun drainAudioEncoder(encoder: MediaCodec, muxerState: MuxerState) {
  val info = MediaCodec.BufferInfo()

  while (true) {
    val outputIndex = encoder.dequeueOutputBuffer(info, 0)

    if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
      muxerState.registerTrack(encoder.outputFormat, isAudio = true)
      continue
    }

    if (outputIndex < 0) break

    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
      encoder.releaseOutputBuffer(outputIndex, false)
      continue
    }

    if (info.size > 0) {
      val buf = encoder.getOutputBuffer(outputIndex)!!
      muxerState.writeOrBuffer(buf, info, isAudio = true)
    }

    encoder.releaseOutputBuffer(outputIndex, false)
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
  val codecErrorRef: () -> MediaCodec.CodecException?,
  val output: String,
  val fps: Int,
  val width: Int,
  val height: Int,
  val audioEncoder: MediaCodec? = null,
  val muxerState: MuxerState,
  val audioFilePath: String? = null,
  val audioFileStartTime: Double = 0.0,
  val audioSampleRate: Int = 44100,
  val audioChannels: Int = 1,
) {
  val deltaUs = 1_000_000L / fps
  @Volatile var ptsUs = 0L

  @Volatile var frameIndex = 0L
  @Volatile var audioStopped = false
  @Volatile var audioFileMaxDurationUs: Long = -1
  val audioFileLatch = CountDownLatch(if (audioFilePath != null) 1 else 0)

  fun drainAudioOutput() {
    val aEnc = audioEncoder ?: return
    drainAudioEncoder(aEnc, muxerState)
  }
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
