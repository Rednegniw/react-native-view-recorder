package com.reactnativeimagesequenceencoder

import android.graphics.BitmapFactory
import android.media.*
import android.util.Log
import android.view.Surface
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*
import java.io.File
import java.nio.ByteBuffer

@ReactModule(name = ImageSequenceEncoderModule.NAME)
class ImageSequenceEncoderModule(
  reactContext: ReactApplicationContext
) : NativeImageSequenceEncoderSpec(reactContext) {

  companion object {
    const val NAME = "ImageSequenceEncoder"
    private const val TAG = "ImageSequenceEncoder"
  }

  /**
   * options: {
   *   folder:  "/cache/chat_frames/",
   *   fps:     30,
   *   width:   1280,
   *   height:  720,
   *   output:  "/data/data/.../movie.mp4"
   * }
   */
  override fun encode(options: ReadableMap, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val params = Params(options)
        Log.w(TAG, "Starting encode: ${params.folder} -> ${params.output}")
        Log.w(TAG, "Dimensions: ${params.width}x${params.height}, fps: ${params.fps}")
        encodeInternal(params)
        Log.w(TAG, "Encode complete!")
        promise.resolve(params.output)
      } catch (t: Throwable) {
        Log.e(TAG, "Encode failed", t)
        promise.reject("ENCODER_ERROR", t)
      }
    }
  }

  /* ------------------------------------------------------------------ */

  private data class Params(
    val folder: String,
    val fps: Int,
    val width: Int,
    val height: Int,
    val output: String
  ) {
    constructor(map: ReadableMap) : this(
      folder = map.getString("folder")!!,
      fps    = map.getInt("fps"),
      width  = map.getInt("width"),
      height = map.getInt("height"),
      output = map.getString("output")!!
    )
  }

  /* ------------------------------------------------------------------ */

  private fun encodeInternal(p: Params) {
    // Clean old file
    File(p.output).delete()

    // List files to encode
    val files = File(p.folder).listFiles()?.sortedBy { it.name } ?: emptyList()
    Log.w(TAG, "Found ${files.size} frames to encode")

    if (files.isEmpty()) {
      throw RuntimeException("No frames found in folder: ${p.folder}")
    }

    /* ---------- MediaCodec setup ---------- */
    // Higher bitrate for better quality (10 Mbps)
    val bitrate = 10_000_000
    val format = MediaFormat.createVideoFormat("video/avc", p.width, p.height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT,
        MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, p.fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1) // More frequent keyframes
    }
    Log.w(TAG, "Encoder config: ${p.width}x${p.height} @ ${p.fps}fps, bitrate=$bitrate")

    val encoder = MediaCodec.createEncoderByType("video/avc")
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val inputSurface: Surface = encoder.createInputSurface()
    encoder.start()
    Log.w(TAG, "MediaCodec started")

    val muxer = MediaMuxer(p.output, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxerStarted = false

    /* ---------- EGL wrapper draws Bitmaps → Surface ---------- */
    val egl = EglWrapper(inputSurface, p.width, p.height)
    Log.w(TAG, "EGL wrapper created")

    var ptsUs = 0L
    val deltaUs = 1_000_000L / p.fps
    val bufferInfo = MediaCodec.BufferInfo()

    // Process each frame
    files.forEachIndexed { index, file ->
      try {
        val bmp = BitmapFactory.decodeFile(file.path)
        if (bmp == null) {
          Log.w(TAG, "Failed to decode frame $index: ${file.path}")
          return@forEachIndexed
        }

        if (index == 0) {
          Log.w(TAG, "First frame size: ${bmp.width}x${bmp.height}, target: ${p.width}x${p.height}")
        }

        egl.drawBitmap(bmp)
        bmp.recycle()

        ptsUs += deltaUs
        egl.setPresentationTime(ptsUs * 1000)
        egl.swapBuffers()

        // Drain encoder periodically (non-blocking)
        drainEncoder(encoder, muxer, bufferInfo, trackIndex, muxerStarted).let { (ti, ms) ->
          trackIndex = ti
          muxerStarted = ms
        }

        if (index % 20 == 0) {
          Log.w(TAG, "Encoded frame $index/${files.size}, muxerStarted=$muxerStarted")
        }
      } catch (e: Exception) {
        Log.e(TAG, "Error processing frame $index", e)
        throw e
      }
    }

    Log.w(TAG, "All frames drawn, signaling EOS, muxerStarted=$muxerStarted")

    // Signal end of stream BEFORE releasing EGL
    encoder.signalEndOfInputStream()
    Log.w(TAG, "EOS signaled")

    // Release EGL resources (but surface is still connected to encoder)
    egl.releaseEgl()
    Log.w(TAG, "EGL released")

    // Drain remaining encoded data
    Log.w(TAG, "Draining encoder, muxerStarted=$muxerStarted")
    var eos = false
    var drainCount = 0
    while (!eos && drainCount < 1000) { // Safety limit
      drainCount++
      val outIndex = encoder.dequeueOutputBuffer(bufferInfo, 10_000)
      when {
        outIndex >= 0 -> {
          val encoded: ByteBuffer = encoder.getOutputBuffer(outIndex)!!
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            bufferInfo.size = 0
          }
          if (bufferInfo.size > 0) {
            if (!muxerStarted) {
              trackIndex = muxer.addTrack(encoder.outputFormat)
              muxer.start()
              muxerStarted = true
            }
            encoded.position(bufferInfo.offset)
            encoded.limit(bufferInfo.offset + bufferInfo.size)
            muxer.writeSampleData(trackIndex, encoded, bufferInfo)
          }
          encoder.releaseOutputBuffer(outIndex, false)
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
            Log.w(TAG, "EOS received after $drainCount drain cycles, muxerStarted=$muxerStarted")
            eos = true
          }
        }
        outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (muxerStarted) throw RuntimeException("Format changed twice")
          trackIndex = muxer.addTrack(encoder.outputFormat)
          muxer.start()
          muxerStarted = true
          Log.w(TAG, "Output format changed, muxer started (final drain)")
        }
        outIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          // No output available yet
        }
      }
    }

    if (!eos) {
      Log.w(TAG, "EOS not received after $drainCount cycles, forcing stop")
    }

    Log.w(TAG, "Stopping encoder and muxer, muxerStarted=$muxerStarted")
    encoder.stop()
    encoder.release()
    if (muxerStarted) {
      muxer.stop()
      Log.w(TAG, "Muxer stopped successfully")
    } else {
      Log.e(TAG, "Muxer was never started - no video data was written!")
    }
    muxer.release()
    Log.w(TAG, "Encode finished: ${p.output}")
  }

  private fun drainEncoder(
    encoder: MediaCodec,
    muxer: MediaMuxer,
    bufferInfo: MediaCodec.BufferInfo,
    currentTrackIndex: Int,
    currentMuxerStarted: Boolean
  ): Pair<Int, Boolean> {
    var trackIndex = currentTrackIndex
    var muxerStarted = currentMuxerStarted

    try {
      while (true) {
        val outIndex = encoder.dequeueOutputBuffer(bufferInfo, 0) // Non-blocking
        when {
          outIndex >= 0 -> {
            val encoded = encoder.getOutputBuffer(outIndex)!!
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
              bufferInfo.size = 0
            }
            if (bufferInfo.size > 0 && muxerStarted) {
              encoded.position(bufferInfo.offset)
              encoded.limit(bufferInfo.offset + bufferInfo.size)
              muxer.writeSampleData(trackIndex, encoded, bufferInfo)
            }
            encoder.releaseOutputBuffer(outIndex, false)
          }
          outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            if (!muxerStarted) {
              trackIndex = muxer.addTrack(encoder.outputFormat)
              muxer.start()
              muxerStarted = true
              Log.w(TAG, "Muxer started from drain (during frame encoding)")
            }
          }
          else -> break // No more output available
        }
      }
    } catch (e: IllegalStateException) {
      Log.e(TAG, "drainEncoder error (may be expected during cleanup): ${e.message}")
    }

    return Pair(trackIndex, muxerStarted)
  }
}
