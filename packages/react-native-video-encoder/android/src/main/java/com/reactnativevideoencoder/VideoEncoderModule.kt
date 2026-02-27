/**
 * On-device PNG-sequence to video encoder using MediaCodec + MediaMuxer.
 * Supports H.264 and HEVC (auto-detected based on hardware availability).
 */

package com.reactnativevideoencoder

import android.graphics.BitmapFactory
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import android.graphics.Bitmap
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch

@ReactModule(name = VideoEncoderModule.NAME)
class VideoEncoderModule(
  reactContext: ReactApplicationContext
) : NativeVideoEncoderSpec(reactContext) {

  companion object {
    const val NAME = "VideoEncoder"
    private const val TAG = "VideoEncoder"
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun getName(): String = NAME

  override fun invalidate() {
    scope.cancel()
    super.invalidate()
  }

  override fun encode(options: ReadableMap, promise: Promise) {
    scope.launch {
      try {
        val params = Params(options)
        encodeInternal(params)
        promise.resolve(params.output)
      } catch (t: Throwable) {
        Log.e(TAG, "Encode failed", t)
        promise.reject("ENCODER_ERROR", t)
      }
    }
  }

  private data class Params(
    val folder: String,
    val fps: Int,
    val width: Int,
    val height: Int,
    val output: String,
    val codecMime: String,
    val bitrate: Int,
    val keyFrameInterval: Int,
  ) {
    constructor(map: ReadableMap) : this(
      folder = map.getString("folder")!!,
      fps    = map.getInt("fps"),
      width  = map.getInt("width"),
      height = map.getInt("height"),
      output = map.getString("output")!!,
      codecMime = resolveCodec(
        map.getString("codec"),
      ),
      bitrate = if (map.hasKey("bitrate") && !map.isNull("bitrate")) {
        map.getInt("bitrate")
      } else {
        map.getInt("width") * map.getInt("height") * map.getInt("fps") / 10
      },
      keyFrameInterval = if (map.hasKey("keyFrameInterval") && !map.isNull("keyFrameInterval")) {
        map.getInt("keyFrameInterval")
      } else {
        1
      },
    )
  }

  private fun sendProgressEvent(framesEncoded: Int, totalFrames: Int) {
    val params = Arguments.createMap().apply {
      putInt("framesEncoded", framesEncoded)
      putInt("totalFrames", totalFrames)
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onEncodeProgress", params)
  }

  private fun decodeSampledBitmap(path: String, reqWidth: Int, reqHeight: Int): android.graphics.Bitmap? {
    // First pass: read dimensions only
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)

    // Calculate inSampleSize
    var inSampleSize = 1
    if (bounds.outHeight > reqHeight || bounds.outWidth > reqWidth) {
      val halfH = bounds.outHeight / 2
      val halfW = bounds.outWidth / 2
      while (halfH / inSampleSize >= reqHeight && halfW / inSampleSize >= reqWidth) {
        inSampleSize *= 2
      }
    }

    // Second pass: decode at target size with consistent pixel format
    val opts = BitmapFactory.Options().apply {
      this.inSampleSize = inSampleSize
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return BitmapFactory.decodeFile(path, opts)
  }

  private fun encodeInternal(p: Params) {
    File(p.output).delete()

    // Collect and sort PNG frames
    val files = File(p.folder).listFiles { file -> file.name.endsWith(".png") }
      ?.sortedBy { it.name }
      ?: emptyList()

    if (files.isEmpty()) {
      throw RuntimeException("No .png frames found in folder: ${p.folder}")
    }

    val totalFrames = files.size
    Log.d(TAG, "Encoding $totalFrames frames: ${p.width}x${p.height} @ ${p.fps}fps, codec=${p.codecMime}, bitrate=${p.bitrate}")

    // MediaCodec format
    val format = MediaFormat.createVideoFormat(p.codecMime, p.width, p.height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, p.bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, p.fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, p.keyFrameInterval)
    }

    val encoder = MediaCodec.createEncoderByType(p.codecMime)
    val muxer = MediaMuxer(p.output, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

    // Async callback state
    var trackIndex = -1
    var muxerStarted = false
    val pendingBuffers = mutableListOf<Pair<ByteBuffer, MediaCodec.BufferInfo>>()
    val eosLatch = CountDownLatch(1)
    var codecError: MediaCodec.CodecException? = null

    val callbackThread = HandlerThread("EncoderCallback").also { it.start() }
    val callbackHandler = Handler(callbackThread.looper)

    encoder.setCallback(object : MediaCodec.Callback() {
      override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {
        // Not called for Surface-input encoding
      }

      override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
          codec.releaseOutputBuffer(index, false)
          return
        }

        if (info.size > 0) {
          val buf: ByteBuffer = codec.getOutputBuffer(index)!!
          if (muxerStarted) {
            buf.position(info.offset)
            buf.limit(info.offset + info.size)
            muxer.writeSampleData(trackIndex, buf, info)
          } else {
            // Queue buffers that arrive before the muxer starts
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

      override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
        if (muxerStarted) return
        trackIndex = muxer.addTrack(format)
        muxer.start()
        muxerStarted = true

        // Flush any buffers that arrived before the muxer was ready
        for ((buf, bufInfo) in pendingBuffers) {
          muxer.writeSampleData(trackIndex, buf, bufInfo)
        }
        pendingBuffers.clear()
        Log.d(TAG, "Muxer started")
      }

      override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
        Log.e(TAG, "MediaCodec error", e)
        codecError = e
        eosLatch.countDown()
      }
    }, callbackHandler)

    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val inputSurface: Surface = encoder.createInputSurface()
    encoder.start()

    val egl = EglWrapper(inputSurface, p.width, p.height)

    try {
      var ptsUs = 0L
      val deltaUs = 1_000_000L / p.fps

      // Process each frame
      files.forEachIndexed { index, file ->
        val bmp = decodeSampledBitmap(file.path, p.width, p.height)
          ?: throw RuntimeException("Failed to decode frame: ${file.name}")

        egl.drawBitmap(bmp)
        bmp.recycle()

        ptsUs += deltaUs
        egl.setPresentationTime(ptsUs * 1000)
        egl.swapBuffers()

        sendProgressEvent(index + 1, totalFrames)

        // Check for codec errors during encoding
        codecError?.let { throw RuntimeException("MediaCodec error during encoding", it) }
      }

      Log.d(TAG, "All frames drawn, signaling EOS")
      encoder.signalEndOfInputStream()
      egl.releaseEgl()

      // Wait for the async callback to receive EOS
      eosLatch.await()
      codecError?.let { throw RuntimeException("MediaCodec error during finalization", it) }
      Log.d(TAG, "EOS received")
    } finally {
      encoder.stop()
      encoder.release()
      if (muxerStarted) muxer.stop()
      muxer.release()
      inputSurface.release()
      callbackThread.quitSafely()
    }

    Log.d(TAG, "Encode complete: ${p.output}")
  }
}

// MARK: - HEVC hardware detection

private fun hasHardwareHevcEncoder(): Boolean {
  val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
  for (info in codecList.codecInfos) {
    if (!info.isEncoder) continue
    if ("video/hevc" !in info.supportedTypes) continue
    val isHardware = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      info.isHardwareAccelerated
    } else {
      !info.name.startsWith("OMX.google.") && !info.name.startsWith("c2.android.")
    }
    if (isHardware) return true
  }
  return false
}

private fun resolveCodec(userCodec: String?): String {
  return when (userCodec) {
    "h264" -> "video/avc"
    "hevc" -> "video/hevc"
    else -> if (hasHardwareHevcEncoder()) "video/hevc" else "video/avc"
  }
}
