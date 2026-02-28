// On-device view-to-MP4 encoder.
// Captures a React Native view's content frame-by-frame using drawHierarchy
// and encodes directly into CVPixelBuffer memory (zero intermediate copies).

import Foundation
import AVFoundation
import VideoToolbox
import UIKit


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

  init(
    writer: AVAssetWriter,
    input: AVAssetWriterInput,
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    colorSpace: CGColorSpace,
    bitmapInfo: UInt32,
    frameDuration: CMTime,
    width: Int,
    height: Int,
    output: String
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


  // MARK: - Lifecycle

  override public func invalidate() {
    sessionsLock.lock()
    let allSessions = sessions
    sessions.removeAll()
    sessionsLock.unlock()

    for (_, session) in allSessions {
      if session.writer.status == .writing {
        session.input.markAsFinished()
        session.writer.cancelWriting()
      }
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

    let fps = (options["fps"] as? NSNumber)?.int32Value ?? 30
    let codecStr = options["codec"] as? String ?? "hevc"
    let keyFrameInterval = (options["keyFrameInterval"] as? NSNumber)?.doubleValue ?? 2.0
    let quality = (options["quality"] as? NSNumber)?.floatValue
    let optimizeForNetwork = (options["optimizeForNetwork"] as? NSNumber)?.boolValue ?? true

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

    // Codec selection
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

    // Clean any existing output file
    try? FileManager.default.removeItem(atPath: output)

    // Set up AVAssetWriter
    let url = URL(fileURLWithPath: output)
    let writer: AVAssetWriter

    do {
      writer = try AVAssetWriter(outputURL: url, fileType: fileType)
    } catch {
      reject("writer_error", error.localizedDescription, error)
      return
    }

    writer.shouldOptimizeForNetworkUse = optimizeForNetwork

    // Compression properties
    var compression: [String: Any] = [
      AVVideoAverageBitRateKey: bitrate,
      AVVideoMaxKeyFrameIntervalDurationKey: keyFrameInterval,
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
      AVVideoCompressionPropertiesKey: compression,
    ]

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    input.expectsMediaDataInRealTime = false
    writer.add(input)

    // Pixel buffer adaptor with 32BGRA format.
    // IOSurface + Metal compatibility keys are required for the zero-copy
    // Skia capture path (CVMetalTextureCacheCreateTextureFromImage).
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
        kCVPixelBufferMetalCompatibilityKey as String: true,
      ]
    )

    // Start the writing session
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
      input: input,
      adaptor: adaptor,
      colorSpace: colorSpace,
      bitmapInfo: bitmapInfo,
      frameDuration: CMTime(value: 1, timescale: fps),
      width: width,
      height: height,
      output: output
    )

    storeSession(sessionId, session)
    resolve(nil)
  }


  // MARK: - captureFrame

  @objc(captureFrame:resolver:rejecter:)
  func captureFrame(
    _ sessionId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // All lookups happen inside the main-queue block to prevent
    // a stale session reference if finishSession races with us.
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

      // Verify the writer is still accepting frames
      guard session.writer.status == .writing else {
        let err = session.writer.error
        reject("writer_failed", "Writer is no longer writing (status: \(session.writer.status.rawValue))", err)
        return
      }

      // Get a pooled pixel buffer from the adaptor
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

      // Draw the view hierarchy directly into pixel buffer memory
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

      // Flip Y axis for UIKit coordinate system (origin at top-left)
      // then scale from view points to video pixels
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
        while !session.input.isReadyForMoreMediaData {
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


  // MARK: - captureSkiaFrame

  @objc(captureSkiaFrame:skiaViewTag:resolver:rejecter:)
  func captureSkiaFrame(
    _ sessionId: String,
    skiaViewTag: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let session = self?.getSession(sessionId) else {
        reject("no_session", "No active session for id: \(sessionId)", nil)
        return
      }

      let width = session.width
      let height = session.height

      guard session.writer.status == .writing else {
        let err = session.writer.error
        reject("writer_failed", "Writer is no longer writing (status: \(session.writer.status.rawValue))", err)
        return
      }

      // Find the SkiaUIView by walking from the registered RecordingView
      guard let registeredView = RecordingViewNative.view(forSession: sessionId) else {
        reject("view_not_found", "No RecordingView found for sessionId: \(sessionId)", nil)
        return
      }

      guard let targetView = Self.findSkiaUIView(in: registeredView) else {
        reject("view_not_found", "No SkiaUIView found in the RecordingView hierarchy for sessionId: \(sessionId)", nil)
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

      // Render Skia content directly into the pixel buffer (zero-copy Metal pipeline)
      do {
        try SkiaCapture.renderSkiaView(
          targetView,
          to: pixelBuffer,
          width: Int32(width),
          height: Int32(height)
        )
      } catch {
        reject("skia_capture_error", error.localizedDescription, error)
        return
      }

      let pts = CMTime(value: CMTimeValue(session.frameIndex), timescale: session.frameDuration.timescale)

      DispatchQueue.global(qos: .userInitiated).async {
        while !session.input.isReadyForMoreMediaData {
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

  private static let skiaUIViewClass: AnyClass? = NSClassFromString("SkiaUIView")

  private static func findSkiaUIView(in view: UIView) -> UIView? {
    if let cls = skiaUIViewClass, view.isKind(of: cls) { return view }
    for subview in view.subviews {
      if let found = findSkiaUIView(in: subview) { return found }
    }
    return nil
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

    if session.writer.status == .completed {
      resolve(session.output)
      return
    }

    guard session.writer.status == .writing else {
      let err = session.writer.error
      reject("writer_failed", "Writer already failed (status: \(session.writer.status.rawValue))", err)
      return
    }

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
}
