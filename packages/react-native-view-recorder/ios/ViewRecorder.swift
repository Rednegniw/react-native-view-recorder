/**
 * On-device view-to-MP4 encoder.
 * Captures a React Native view's content frame-by-frame using drawHierarchy
 * and encodes directly into CVPixelBuffer memory (zero intermediate copies).
 */

import Foundation
import AVFoundation
import VideoToolbox
import UIKit
// MARK: - Defaults

private let kDefaultFps: Int32 = 30
private let kDefaultCodec = "hevc"
private let kDefaultKeyFrameInterval: Double = 2.0
private let kDefaultOptimizeForNetwork = true
private let kDefaultAudioSampleRate: Double = 44100
private let kDefaultAudioChannels: Int = 1
private let kDefaultAudioBitrate: Int = 128000
private let kWriterReadyTimeoutSeconds: TimeInterval = 5.0

// MARK: - Encoder session

private class EncoderSession {

  let writer: AVAssetWriter
  let input: AVAssetWriterInput
  let adaptor: AVAssetWriterInputPixelBufferAdaptor

  let colorSpace: CGColorSpace
  let bitmapInfo: UInt32

  let frameDuration: CMTime
  let width: Int
  let height: Int
  let output: String

  var frameIndex: Int = 0

  // Audio (optional, used by mixAudio / audioFile)
  let audioInput: AVAssetWriterInput?
  let audioAppendQueue: DispatchQueue
  let audioSampleRate: Double
  let audioChannels: Int
  var audioFrameCursor: Int64 = 0
  var audioFormatDescription: CMAudioFormatDescription?
  var audioFilePath: String?
  var audioFileStartTime: Double = 0
  /**
   * Set by finishSession to unblock the audio muxing thread's pacing loop.
   * Negative means recording is still in progress (pace against live frameIndex).
   * Non-negative means "write up to this many seconds of audio, then stop."
   */
  var audioFileMaxDuration: Double = -1

  init(
    writer: AVAssetWriter,
    input: AVAssetWriterInput,
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    colorSpace: CGColorSpace,
    bitmapInfo: UInt32,
    frameDuration: CMTime,
    width: Int,
    height: Int,
    output: String,
    audioInput: AVAssetWriterInput? = nil,
    audioSampleRate: Double = kDefaultAudioSampleRate,
    audioChannels: Int = kDefaultAudioChannels
  ) {
    self.writer = writer
    self.input = input
    self.adaptor = adaptor
    self.colorSpace = colorSpace
    self.bitmapInfo = bitmapInfo
    self.frameDuration = frameDuration
    self.width = width
    self.height = height
    self.output = output
    self.audioInput = audioInput
    self.audioSampleRate = audioSampleRate
    self.audioChannels = audioChannels
    self.audioAppendQueue = DispatchQueue(label: "com.viewrecorder.audio.append.\(UUID().uuidString)")
  }
}

// MARK: - ViewRecorder

@objc(ViewRecorder)
public final class ViewRecorder: RCTEventEmitter {

  private var sessions: [String: EncoderSession] = [:]
  private let sessionsLock = NSLock()

  override public static func moduleName() -> String! { "ViewRecorder" }
  override public static func requiresMainQueueSetup() -> Bool { false }

  override public func supportedEvents() -> [String]! { [] }

  // MARK: - Session helpers

  private func getSession(_ id: String) -> EncoderSession? {
    sessionsLock.lock()
    defer { sessionsLock.unlock() }
    return sessions[id]
  }

  private func storeSession(_ id: String, _ session: EncoderSession) {
    sessionsLock.lock()
    defer { sessionsLock.unlock() }
    sessions[id] = session
  }

  @discardableResult
  private func removeSession(_ id: String) -> EncoderSession? {
    sessionsLock.lock()
    defer { sessionsLock.unlock() }
    return sessions.removeValue(forKey: id)
  }

  private func hasSession(_ id: String) -> Bool {
    sessionsLock.lock()
    defer { sessionsLock.unlock() }
    return sessions[id] != nil
  }

  private func cleanupFailedSessionStart(
    _ sessionId: String,
    code: String,
    message: String,
    error: Error?,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if let session = removeSession(sessionId) {
      session.audioInput?.markAsFinished()
      session.input.markAsFinished()
      session.writer.cancelWriting()
      try? FileManager.default.removeItem(atPath: session.output)
    }
    reject(code, message, error)
  }

  private func ensureAudioFormatDescription(_ session: EncoderSession) -> CMAudioFormatDescription? {
    if let existing = session.audioFormatDescription {
      return existing
    }

    var asbd = AudioStreamBasicDescription(
      mSampleRate: session.audioSampleRate,
      mFormatID: kAudioFormatLinearPCM,
      mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
      mBytesPerPacket: UInt32(session.audioChannels * 4),
      mFramesPerPacket: 1,
      mBytesPerFrame: UInt32(session.audioChannels * 4),
      mChannelsPerFrame: UInt32(session.audioChannels),
      mBitsPerChannel: 32,
      mReserved: 0
    )

    var formatDescription: CMAudioFormatDescription?
    let status = CMAudioFormatDescriptionCreate(
      allocator: kCFAllocatorDefault,
      asbd: &asbd,
      layoutSize: 0,
      layout: nil,
      magicCookieSize: 0,
      magicCookie: nil,
      extensions: nil,
      formatDescriptionOut: &formatDescription
    )

    guard status == noErr, let formatDescription else {
      return nil
    }

    session.audioFormatDescription = formatDescription
    return formatDescription
  }

  private func makeAudioSampleBuffer(
    session: EncoderSession,
    interleavedSamples: [Float32],
    frameCount: Int,
    presentationTimeStamp: CMTime
  ) -> CMSampleBuffer? {
    let expectedSampleCount = frameCount * session.audioChannels
    guard expectedSampleCount > 0, interleavedSamples.count == expectedSampleCount else { return nil }
    guard let format = ensureAudioFormatDescription(session) else { return nil }

    // Create block buffer with Float32 PCM data
    let byteSize = interleavedSamples.count * MemoryLayout<Float32>.size
    let dataPtr = UnsafeMutablePointer<Float32>.allocate(capacity: interleavedSamples.count)
    interleavedSamples.withUnsafeBufferPointer { buffer in
      guard let baseAddress = buffer.baseAddress else { return }
      dataPtr.initialize(from: baseAddress, count: interleavedSamples.count)
    }

    var blockBuffer: CMBlockBuffer?
    let blockStatus = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault,
      memoryBlock: dataPtr,
      blockLength: byteSize,
      blockAllocator: kCFAllocatorMalloc,
      customBlockSource: nil,
      offsetToData: 0,
      dataLength: byteSize,
      flags: 0,
      blockBufferOut: &blockBuffer
    )
    guard blockStatus == noErr, let blockBuffer else {
      dataPtr.deallocate()
      return nil
    }

    // Create sample buffer with data attached and ready
    var timing = CMSampleTimingInfo(
      duration: CMTime(value: CMTimeValue(frameCount), timescale: Int32(session.audioSampleRate)),
      presentationTimeStamp: presentationTimeStamp,
      decodeTimeStamp: .invalid
    )
    var sampleSizeArray = [session.audioChannels * 4]
    var sampleBuffer: CMSampleBuffer?

    let sampleBufferStatus = CMSampleBufferCreate(
      allocator: kCFAllocatorDefault,
      dataBuffer: blockBuffer,
      dataReady: true,
      makeDataReadyCallback: nil,
      refcon: nil,
      formatDescription: format,
      sampleCount: frameCount,
      sampleTimingEntryCount: 1,
      sampleTimingArray: &timing,
      sampleSizeEntryCount: 1,
      sampleSizeArray: &sampleSizeArray,
      sampleBufferOut: &sampleBuffer
    )
    guard sampleBufferStatus == noErr, let sampleBuffer else { return nil }

    return sampleBuffer
  }

  private func appendAudioSamples(
    session: EncoderSession,
    interleavedSamples: [Float32],
    frameCount: Int,
    resolver resolve: RCTPromiseResolveBlock? = nil,
    rejecter reject: RCTPromiseRejectBlock? = nil
  ) {
    guard frameCount > 0 else {
      resolve?(nil)
      return
    }

    session.audioAppendQueue.async { [weak self] in
      guard let self else { return }
      guard let audioInput = session.audioInput else {
        reject?("no_audio", "No audio input configured for this session.", nil)
        return
      }

      let writer = session.writer
      guard writer.status == .writing else {
        reject?("writer_failed", "Writer failed during audio append", writer.error)
        return
      }

      let pts = CMTime(value: CMTimeValue(session.audioFrameCursor), timescale: Int32(session.audioSampleRate))
      guard let sampleBuffer = self.makeAudioSampleBuffer(
        session: session,
        interleavedSamples: interleavedSamples,
        frameCount: frameCount,
        presentationTimeStamp: pts
      ) else {
        reject?("audio_buffer_error", "Failed to create audio sample buffer", nil)
        return
      }

      let waitStart = Date()
      while !audioInput.isReadyForMoreMediaData {
        guard writer.status == .writing else {
          reject?("writer_failed", "Writer failed during audio append", writer.error)
          return
        }
        if Date().timeIntervalSince(waitStart) > kWriterReadyTimeoutSeconds {
          reject?("append_timeout", "Timed out waiting for audio writer input readiness.", nil)
          return
        }
        Thread.sleep(forTimeInterval: 0.005)
      }

      guard writer.status == .writing else {
        reject?("writer_failed", "Writer failed during audio append", writer.error)
        return
      }

      guard audioInput.append(sampleBuffer) else {
        let err = writer.error?.localizedDescription ?? "Unknown append error"
        reject?("append_error", "Failed to append audio sample buffer: \(err)", writer.error)
        return
      }

      session.audioFrameCursor += Int64(frameCount)
      resolve?(nil)
    }
  }

  // MARK: - Lifecycle

  override public func invalidate() {
    sessionsLock.lock()
    let allSessions = sessions
    sessions.removeAll()
    sessionsLock.unlock()

    for (_, session) in allSessions where session.writer.status == .writing {
      session.input.markAsFinished()
      session.audioInput?.markAsFinished()
      session.writer.cancelWriting()
    }

    super.invalidate()
  }

  // MARK: - startSession

  @objc(startSession:resolver:rejecter:)
  func startSession(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let sessionId = options["sessionId"] as? String else {
      reject("missing_param", "sessionId is required", nil)
      return
    }

    guard !hasSession(sessionId) else {
      reject("session_exists", "Session \(sessionId) already exists. Call finishSession first.", nil)
      return
    }

    let fps = (options["fps"] as? NSNumber)?.int32Value ?? kDefaultFps
    let codecStr = options["codec"] as? String ?? kDefaultCodec
    let keyFrameInterval = (options["keyFrameInterval"] as? NSNumber)?.doubleValue ?? kDefaultKeyFrameInterval
    let quality = (options["quality"] as? NSNumber)?.floatValue
    let optimizeForNetwork = (options["optimizeForNetwork"] as? NSNumber)?.boolValue ?? kDefaultOptimizeForNetwork

    let audioSampleRate = (options["audioSampleRate"] as? NSNumber)?.doubleValue ?? kDefaultAudioSampleRate
    let audioChannels = (options["audioChannels"] as? NSNumber)?.intValue ?? kDefaultAudioChannels
    let audioBitrate = (options["audioBitrate"] as? NSNumber)?.intValue ?? kDefaultAudioBitrate

    guard let output = options["output"] as? String else {
      reject("missing_param", "output path is required", nil)
      return
    }

    // Look up the native view from the registry (optional when width/height are provided)
    let view = RecordingViewNative.view(forSession: sessionId)

    let explicitWidth = (options["width"] as? NSNumber)?.intValue
    let explicitHeight = (options["height"] as? NSNumber)?.intValue

    // Read view dimensions in pixels (only needed when explicit size is not provided)
    var viewWidth: Int = 0
    var viewHeight: Int = 0

    if explicitWidth == nil || explicitHeight == nil {
      guard let view else {
        reject("view_not_found", "No RecordingView found for sessionId: \(sessionId). Either mount a RecordingView with this sessionId or provide explicit width and height.", nil)
        return
      }

      let readBounds = {
        let scale = view.contentScaleFactor
        viewWidth = Int(round(view.bounds.width * scale))
        viewHeight = Int(round(view.bounds.height * scale))
      }

      if Thread.isMainThread {
        readBounds()
      } else {
        DispatchQueue.main.sync { readBounds() }
      }
    }

    // Allow explicit overrides, then round to even (H.264/HEVC requirement)
    let rawWidth = explicitWidth ?? viewWidth
    let rawHeight = explicitHeight ?? viewHeight
    let width = (rawWidth + 1) & ~1
    let height = (rawHeight + 1) & ~1

    guard width > 0, height > 0 else {
      reject("invalid_size", "View has zero dimensions (\(width)x\(height))", nil)
      return
    }

    let codecType: AVVideoCodecType
    let useAlpha: Bool

    switch codecStr {
    case "h264":
      codecType = .h264
      useAlpha = false
    case "hevcWithAlpha":
      codecType = .hevcWithAlpha
      useAlpha = true
    default:
      codecType = .hevc
      useAlpha = false
    }

    // Bitrate: user-provided or auto-scaled by resolution
    let bitrate: Int
    if let custom = options["bitrate"] as? NSNumber {
      bitrate = custom.intValue
    } else {
      bitrate = width * height * Int(fps) / 10
    }

    // File type: hevcWithAlpha requires .mov
    let fileType: AVFileType = useAlpha ? .mov : .mp4

    if useAlpha && (output as NSString).pathExtension.lowercased() == "mp4" {
      reject("invalid_config", "hevcWithAlpha requires .mov output. Alpha video is not supported in .mp4 containers.", nil)
      return
    }

    try? FileManager.default.removeItem(atPath: output)

    let url = URL(fileURLWithPath: output)
    let writer: AVAssetWriter

    do {
      writer = try AVAssetWriter(outputURL: url, fileType: fileType)
    } catch {
      reject("writer_error", error.localizedDescription, error)
      return
    }

    writer.shouldOptimizeForNetworkUse = optimizeForNetwork

    var compression: [String: Any] = [
      AVVideoAverageBitRateKey: bitrate,
      AVVideoMaxKeyFrameIntervalDurationKey: keyFrameInterval
    ]

    if let quality {
      compression[kVTCompressionPropertyKey_Quality as String] = quality
    }

    if useAlpha, let quality {
      compression[kVTCompressionPropertyKey_TargetQualityForAlpha as String] = quality
    }

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: codecType,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: compression
    ]

    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    videoInput.expectsMediaDataInRealTime = false
    writer.add(videoInput)

    /**
     * Pixel buffer adaptor with 32BGRA format.
     * IOSurface + Metal compatibility keys are required for the zero-copy
     * Skia capture path (CVMetalTextureCacheCreateTextureFromImage).
     */
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
        kCVPixelBufferMetalCompatibilityKey as String: true
      ]
    )

    // Audio input (optional, used by mixAudio / audioFile)
    var audioWriterInput: AVAssetWriterInput?
    let wantMixAudio = (options["hasMixAudio"] as? NSNumber)?.boolValue ?? false
    let audioFilePath = options["audioFilePath"] as? String
    let audioFileStartTime = (options["audioFileStartTime"] as? NSNumber)?.doubleValue ?? 0
    let hasAnyAudio = wantMixAudio || audioFilePath != nil

    if hasAnyAudio {
      let audioSettings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: audioSampleRate,
        AVNumberOfChannelsKey: audioChannels,
        AVEncoderBitRateKey: audioBitrate
      ]

      let aInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
      aInput.expectsMediaDataInRealTime = true
      writer.add(aInput)
      audioWriterInput = aInput
    }

    guard writer.startWriting() else {
      reject("writer_error", writer.error?.localizedDescription ?? "Failed to start writing", writer.error)
      return
    }

    writer.startSession(atSourceTime: .zero)

    // Pre-compute color space and bitmap info
    let bitmapAlpha: CGImageAlphaInfo = useAlpha ? .premultipliedFirst : .noneSkipFirst
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = bitmapAlpha.rawValue | CGBitmapInfo.byteOrder32Little.rawValue

    let session = EncoderSession(
      writer: writer,
      input: videoInput,
      adaptor: adaptor,
      colorSpace: colorSpace,
      bitmapInfo: bitmapInfo,
      frameDuration: CMTime(value: 1, timescale: fps),
      width: width,
      height: height,
      output: output,
      audioInput: audioWriterInput,
      audioSampleRate: audioSampleRate,
      audioChannels: audioChannels
    )

    session.audioFilePath = audioFilePath
    session.audioFileStartTime = audioFileStartTime

    storeSession(sessionId, session)

    /**
     * Start audio file muxing on a background thread so audio samples
     * are written concurrently with video frames (AVAssetWriter requires
     * roughly interleaved audio/video timestamps).
     */
    if audioFilePath != nil {
      session.audioAppendQueue.async { [weak self] in
        self?.muxAudioFile(session)
      }
    }

    resolve(nil)
  }

  // MARK: - captureFrame

  @objc(captureFrame:resolver:rejecter:)
  func captureFrame(
    _ sessionId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    /**
     * All lookups happen inside the main-queue block to prevent
     * a stale session reference if finishSession races with us.
     */
    DispatchQueue.main.async { [weak self] in
      guard let session = self?.getSession(sessionId) else {
        reject("no_session", "No active session for id: \(sessionId)", nil)
        return
      }

      guard let view = RecordingViewNative.view(forSession: sessionId) else {
        reject("view_not_found", "No RecordingView found for sessionId: \(sessionId)", nil)
        return
      }

      let width = session.width
      let height = session.height

      guard session.writer.status == .writing else {
        let err = session.writer.error
        reject("writer_failed", "Writer is no longer writing (status: \(session.writer.status.rawValue))", err)
        return
      }

      guard let pool = session.adaptor.pixelBufferPool else {
        reject("pool_error", "Pixel buffer pool unavailable", nil)
        return
      }

      var pixelBufferOut: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBufferOut)

      guard let pixelBuffer = pixelBufferOut else {
        reject("buffer_error", "Failed to create pixel buffer for frame \(session.frameIndex)", nil)
        return
      }

      CVPixelBufferLockBaseAddress(pixelBuffer, [])

      guard let ctx = CGContext(
        data: CVPixelBufferGetBaseAddress(pixelBuffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: session.colorSpace,
        bitmapInfo: session.bitmapInfo
      ) else {
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        reject("context_error", "Failed to create CGContext for frame \(session.frameIndex)", nil)
        return
      }

      /**
       * Flip Y axis for UIKit coordinate system (origin at top-left)
       * then scale from view points to video pixels.
       */
      let boundsWidth = view.bounds.width
      let boundsHeight = view.bounds.height

      ctx.translateBy(x: 0, y: CGFloat(height))
      ctx.scaleBy(
        x: CGFloat(width) / boundsWidth,
        y: CGFloat(-height) / boundsHeight
      )

      UIGraphicsPushContext(ctx)
      view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
      UIGraphicsPopContext()

      CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

      /**
       * Append on a background queue so we can wait for readyForMoreMediaData
       * without blocking the main thread. This provides backpressure to JS.
       */
      let pts = CMTime(value: CMTimeValue(session.frameIndex), timescale: session.frameDuration.timescale)

      DispatchQueue.global(qos: .userInitiated).async {
        let waitStart = Date()
        while !session.input.isReadyForMoreMediaData {
          guard session.writer.status == .writing else {
            reject("writer_failed", "Writer stopped while waiting for video input readiness.", session.writer.error)
            return
          }
          if Date().timeIntervalSince(waitStart) > kWriterReadyTimeoutSeconds {
            reject("append_timeout", "Timed out waiting for video writer input readiness.", nil)
            return
          }
          Thread.sleep(forTimeInterval: 0.005)
        }

        guard session.adaptor.append(pixelBuffer, withPresentationTime: pts) else {
          let err = session.writer.error?.localizedDescription ?? "Unknown append error"
          reject("append_error", "Failed to append frame \(session.frameIndex): \(err)", session.writer.error)
          return
        }

        session.frameIndex += 1
        resolve(nil)
      }
    }
  }

  // MARK: - takeSnapshot

  @objc(takeSnapshot:resolver:rejecter:)
  func takeSnapshot(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let sessionId = options["sessionId"] as? String else {
      reject("invalid_options", "sessionId is required", nil)
      return
    }

    let format = (options["format"] as? String) ?? "png"
    let quality = (options["quality"] as? Double) ?? 0.9
    let outputPath = options["output"] as? String
    let resultType = (options["result"] as? String) ?? "tmpfile"
    let requestedWidth = options["width"] as? Int
    let requestedHeight = options["height"] as? Int

    if resultType == "tmpfile" && (outputPath == nil || outputPath!.isEmpty) {
      reject("invalid_options", "output is required when result is 'tmpfile'", nil)
      return
    }

    DispatchQueue.main.async {
      guard let view = RecordingViewNative.view(forSession: sessionId) else {
        reject("view_not_found", "No RecordingView found for sessionId: \(sessionId)", nil)
        return
      }

      let scale = UIScreen.main.scale
      let width = requestedWidth ?? Int(view.bounds.width * scale)
      let height = requestedHeight ?? Int(view.bounds.height * scale)

      let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))

      let drawAction: (UIGraphicsImageRendererContext) -> Void = { ctx in
        ctx.cgContext.scaleBy(
          x: CGFloat(width) / view.bounds.width,
          y: CGFloat(height) / view.bounds.height
        )
        view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
      }

      let imageData: Data
      if format == "jpg" {
        imageData = renderer.jpegData(withCompressionQuality: CGFloat(quality), actions: drawAction)
      } else {
        imageData = renderer.pngData(actions: drawAction)
      }

      // Dispatch file I/O and base64 encoding off the main thread
      DispatchQueue.global(qos: .userInitiated).async {
        if resultType == "base64" {
          resolve(imageData.base64EncodedString())
        } else {
          do {
            try imageData.write(to: URL(fileURLWithPath: outputPath!))
            resolve(outputPath!)
          } catch {
            reject("write_error", "Failed to write snapshot: \(error.localizedDescription)", error)
          }
        }
      }
    }
  }

  // MARK: - writeAudioSamples

  @objc(writeAudioSamples:samplesBase64:resolver:rejecter:)
  func writeAudioSamples(
    _ sessionId: String,
    samplesBase64: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let session = getSession(sessionId) else {
      reject("no_session", "No active session for id: \(sessionId)", nil)
      return
    }

    guard session.audioInput != nil else {
      reject("no_audio", "No audio input configured for session \(sessionId). Pass mixAudio to enable audio.", nil)
      return
    }

    guard let data = Data(base64Encoded: samplesBase64) else {
      reject("invalid_base64", "Invalid base64-encoded audio data", nil)
      return
    }

    let sampleCount = data.count / MemoryLayout<Float32>.size
    guard sampleCount > 0 else {
      resolve(nil)
      return
    }

    let channels = session.audioChannels
    guard sampleCount % channels == 0 else {
      reject("audio_buffer_error", "Audio sample count must be divisible by channel count (\(channels)).", nil)
      return
    }

    let framesPerBuffer = sampleCount / channels

    let interleavedSamples: [Float32] = data.withUnsafeBytes { ptr in
      Array(ptr.bindMemory(to: Float32.self))
    }

    appendAudioSamples(
      session: session,
      interleavedSamples: interleavedSamples,
      frameCount: framesPerBuffer,
      resolver: resolve,
      rejecter: reject
    )
  }

  // MARK: - Audio file muxing

  private func muxAudioFile(_ session: EncoderSession) {
    guard let audioInput = session.audioInput,
          let filePath = session.audioFilePath else { return }

    let fileUrl = URL(fileURLWithPath: filePath)
    let asset = AVURLAsset(url: fileUrl)

    guard let audioTrack = asset.tracks(withMediaType: .audio).first else { return }

    let outputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: session.audioSampleRate,
      AVNumberOfChannelsKey: session.audioChannels,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false
    ]

    let trackOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: outputSettings)
    trackOutput.alwaysCopiesSampleData = false

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      return
    }

    // Apply startTime offset
    let startTime = CMTime(seconds: session.audioFileStartTime, preferredTimescale: Int32(session.audioSampleRate))
    let duration = asset.duration
    if startTime < duration {
      reader.timeRange = CMTimeRange(start: startTime, duration: CMTimeSubtract(duration, startTime))
    }

    reader.add(trackOutput)
    guard reader.startReading() else { return }

    var samplesWritten: Int64 = 0

    while reader.status == .reading, session.writer.status == .writing {
      guard let sampleBuffer = trackOutput.copyNextSampleBuffer() else { break }

      let numSamples = CMSampleBufferGetNumSamples(sampleBuffer)
      guard numSamples > 0 else { continue }

      /**
       * Pace audio against video: don't write audio too far ahead of the
       * current video frame, or AVAssetWriter will fail with interleaving errors.
       * When audioFileMaxDuration is set (by finishSession), stop at that duration.
       */
      let audioTimeSec = Double(samplesWritten) / session.audioSampleRate
      let maxDuration = session.audioFileMaxDuration
      if maxDuration >= 0 && audioTimeSec >= maxDuration { break }

      while session.writer.status == .writing {
        let currentMax = session.audioFileMaxDuration
        if currentMax >= 0 { break } // finishSession called, stop pacing
        let videoTimeSec = Double(session.frameIndex) / Double(session.frameDuration.timescale)
        if audioTimeSec <= videoTimeSec + 1.0 { break }
        Thread.sleep(forTimeInterval: 0.01)
      }

      guard session.writer.status == .writing else { break }

      let pts = CMTime(value: CMTimeValue(samplesWritten), timescale: Int32(session.audioSampleRate))
      var timing = CMSampleTimingInfo(
        duration: CMSampleBufferGetDuration(sampleBuffer),
        presentationTimeStamp: pts,
        decodeTimeStamp: .invalid
      )

      var rebasedBuffer: CMSampleBuffer?
      CMSampleBufferCreateCopyWithNewTiming(
        allocator: kCFAllocatorDefault,
        sampleBuffer: sampleBuffer,
        sampleTimingEntryCount: 1,
        sampleTimingArray: &timing,
        sampleBufferOut: &rebasedBuffer
      )

      guard let outputBuffer = rebasedBuffer else { continue }

      let waitStart = Date()
      while !audioInput.isReadyForMoreMediaData {
        guard session.writer.status == .writing else { return }
        if Date().timeIntervalSince(waitStart) > kWriterReadyTimeoutSeconds { return }
        Thread.sleep(forTimeInterval: 0.005)
      }

      audioInput.append(outputBuffer)
      samplesWritten += Int64(numSamples)
    }

    reader.cancelReading()
  }

  // MARK: - finishSession

  @objc(finishSession:resolver:rejecter:)
  func finishSession(
    _ sessionId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let session = removeSession(sessionId) else {
      reject("no_session", "No active session for id: \(sessionId)", nil)
      return
    }

    // Tell the audio muxing thread the final video duration so it stops pacing
    let finalDuration = Double(session.frameIndex) / Double(session.frameDuration.timescale)
    session.audioFileMaxDuration = finalDuration

    // Wait for background audio file muxing to complete
    session.audioAppendQueue.sync {}

    if session.writer.status == .completed {
      resolve(session.output)
      return
    }

    guard session.writer.status == .writing else {
      let err = session.writer.error
      reject("writer_failed", "Writer already failed (status: \(session.writer.status.rawValue))", err)
      return
    }

    session.audioInput?.markAsFinished()
    session.input.markAsFinished()

    session.writer.finishWriting {
      if session.writer.status == .completed {
        resolve(session.output)
      } else {
        let err = session.writer.error
        reject("finish_error", err?.localizedDescription ?? "Writer failed with status: \(session.writer.status.rawValue)", err)
      }
    }
  }

  // MARK: - cancelSession

  @objc(cancelSession:resolver:rejecter:)
  func cancelSession(
    _ sessionId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let session = removeSession(sessionId) else {
      resolve(nil)
      return
    }

    if session.writer.status == .writing {
      session.audioInput?.markAsFinished()
      session.input.markAsFinished()
      session.writer.cancelWriting()
    }

    try? FileManager.default.removeItem(atPath: session.output)
    resolve(nil)
  }
}
