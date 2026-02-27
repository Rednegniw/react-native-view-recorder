/**
 * On-device PNG-sequence to video encoder using AVAssetWriter.
 * Supports H.264, HEVC, and HEVC with alpha (transparent video).
 */

import Foundation
import AVFoundation
import VideoToolbox
import UIKit
import React

@objc(VideoEncoder)
final class VideoEncoder: RCTEventEmitter {
  private var hasListeners = false

  override static func moduleName() -> String! { "VideoEncoder" }
  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["onEncodeProgress"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  /**
   * Encode a directory of PNG frames into a video file.
   *
   * Options:
   *   folder  - directory path ending with "/"
   *   fps     - frames per second
   *   width   - output width in pixels
   *   height  - output height in pixels
   *   output  - absolute destination file path
   *   codec   - "h264" | "hevc" | "hevcWithAlpha" (default: "hevc")
   *   bitrate - bits per second (default: auto-scaled by resolution)
   *   quality - 0.0-1.0 encoding quality hint
   *   keyFrameInterval    - seconds between keyframes (default: 2)
   *   optimizeForNetwork  - move moov atom to front (default: true)
   */
  @objc(encode:resolver:rejecter:)
  func encode(
    _ options: NSDictionary,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let params = try EncoderParams(dict: options)
        try await self.runEncode(params: params)
        resolver(params.output)
      } catch {
        rejecter("encode_error", error.localizedDescription, error)
      }
    }
  }

  private struct EncoderParams {
    let folder: String
    let fps: Int32
    let width: Int
    let height: Int
    let output: String
    let codecType: AVVideoCodecType
    let useAlpha: Bool
    let bitrate: Int
    let quality: Float?
    let keyFrameInterval: Double
    let optimizeForNetwork: Bool

    init(dict: NSDictionary) throws {
      guard
        let folder = dict["folder"] as? String,
        let fps    = dict["fps"]    as? NSNumber,
        let width  = dict["width"]  as? NSNumber,
        let height = dict["height"] as? NSNumber,
        let output = dict["output"] as? String
      else {
        throw NSError(domain: "VideoEncoder", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Missing required options (folder, fps, width, height, output)"])
      }

      self.folder = folder
      self.fps    = fps.int32Value
      self.width  = width.intValue
      self.height = height.intValue
      self.output = output

      // Codec selection (default: HEVC)
      let codecStr = dict["codec"] as? String ?? "hevc"
      switch codecStr {
      case "h264":
        self.codecType = .h264
        self.useAlpha = false
      case "hevcWithAlpha":
        self.codecType = .hevcWithAlpha
        self.useAlpha = true
      default:
        self.codecType = .hevc
        self.useAlpha = false
      }

      // Bitrate: user-provided or auto-scaled by resolution
      if let customBitrate = dict["bitrate"] as? NSNumber {
        self.bitrate = customBitrate.intValue
      } else {
        self.bitrate = self.width * self.height * Int(self.fps) / 10
      }

      // Quality hint (0.0-1.0)
      self.quality = (dict["quality"] as? NSNumber)?.floatValue

      // Keyframe interval in seconds (default: 2s)
      self.keyFrameInterval = (dict["keyFrameInterval"] as? NSNumber)?.doubleValue ?? 2.0

      // Move moov atom to front for streaming (default: true)
      if let opt = dict["optimizeForNetwork"] as? NSNumber {
        self.optimizeForNetwork = opt.boolValue
      } else {
        self.optimizeForNetwork = true
      }
    }

    // hevcWithAlpha requires .mov; h264/hevc use .mp4
    var fileType: AVFileType {
      useAlpha ? .mov : .mp4
    }
  }

  private func runEncode(params p: EncoderParams) async throws {

    // Clean any existing output file
    try? FileManager.default.removeItem(atPath: p.output)

    // Collect and sort PNG frames
    let allFiles = try FileManager.default.contentsOfDirectory(atPath: p.folder)
    let pngNames = allFiles
      .filter { $0.hasSuffix(".png") }
      .sorted { $0.localizedStandardCompare($1) == .orderedAscending }

    guard !pngNames.isEmpty else {
      throw NSError(domain: "VideoEncoder", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "No .png files found in folder: \(p.folder)"])
    }

    let totalFrames = pngNames.count

    // 1. Writer setup
    let url = URL(fileURLWithPath: p.output)
    let writer = try AVAssetWriter(outputURL: url, fileType: p.fileType)
    writer.shouldOptimizeForNetworkUse = p.optimizeForNetwork

    // Compression properties
    var compression: [String: Any] = [
      AVVideoAverageBitRateKey: p.bitrate,
      AVVideoMaxKeyFrameIntervalDurationKey: p.keyFrameInterval,
    ]

    if let quality = p.quality {
      compression[kVTCompressionPropertyKey_Quality as String] = quality
    }

    if p.useAlpha, let quality = p.quality {
      compression[kVTCompressionPropertyKey_TargetQualityForAlpha as String] = quality
    }

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: p.codecType,
      AVVideoWidthKey: p.width,
      AVVideoHeightKey: p.height,
      AVVideoCompressionPropertiesKey: compression,
    ]

    let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    input.expectsMediaDataInRealTime = false
    writer.add(input)

    // Alpha-aware pixel format
    let bitmapAlpha: CGImageAlphaInfo = p.useAlpha ? .premultipliedFirst : .noneSkipFirst

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: p.width,
        kCVPixelBufferHeightKey as String: p.height,
      ])

    guard writer.startWriting() else {
      throw writer.error ?? NSError(domain: "VideoEncoder", code: 8,
                                    userInfo: [NSLocalizedDescriptionKey: "AVAssetWriter failed to start writing"])
    }
    writer.startSession(atSourceTime: .zero)

    // 2. Encode frames using pull-based backpressure
    let frameDuration = CMTime(value: 1, timescale: p.fps)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = bitmapAlpha.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    let mediaQueue = DispatchQueue(label: "com.videoencoder.mediaInput")

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      var frameIndex = 0
      var encodeError: Error?
      var finished = false

      input.requestMediaDataWhenReady(on: mediaQueue) { [weak self] in
        // Guard against re-entry after the continuation has been resumed
        guard !finished else { return }

        while input.isReadyForMoreMediaData {
          // All frames consumed: finalize
          if frameIndex >= totalFrames {
            finished = true
            input.markAsFinished()
            writer.finishWriting {
              if writer.status == .completed {
                continuation.resume()
              } else {
                continuation.resume(throwing: writer.error ?? NSError(
                  domain: "VideoEncoder", code: 2,
                  userInfo: [NSLocalizedDescriptionKey: "Writer failed with status: \(writer.status.rawValue)"]))
              }
            }
            return
          }

          // Encode error from a previous iteration: bail out
          if let error = encodeError {
            finished = true
            input.markAsFinished()
            writer.cancelWriting()
            continuation.resume(throwing: error)
            return
          }

          autoreleasepool {
            let name = pngNames[frameIndex]
            let path = p.folder + name

            // Load image (error if decode fails)
            guard let uiImg = UIImage(contentsOfFile: path), let cgImg = uiImg.cgImage else {
              encodeError = NSError(domain: "VideoEncoder", code: 4,
                                   userInfo: [NSLocalizedDescriptionKey: "Failed to decode frame: \(name)"])
              return
            }

            // Get pooled pixel buffer
            guard let pool = adaptor.pixelBufferPool else {
              encodeError = NSError(domain: "VideoEncoder", code: 5,
                                   userInfo: [NSLocalizedDescriptionKey: "Pixel buffer pool unavailable"])
              return
            }
            var pixelBufferOut: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBufferOut)
            guard let pixelBuffer = pixelBufferOut else {
              encodeError = NSError(domain: "VideoEncoder", code: 6,
                                   userInfo: [NSLocalizedDescriptionKey: "Failed to create pixel buffer for frame \(frameIndex)"])
              return
            }

            // Draw CGImage into the pixel buffer
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            let ctx = CGContext(
              data: CVPixelBufferGetBaseAddress(pixelBuffer),
              width: p.width,
              height: p.height,
              bitsPerComponent: 8,
              bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
              space: colorSpace,
              bitmapInfo: bitmapInfo)
            ctx?.draw(cgImg, in: CGRect(x: 0, y: 0, width: p.width, height: p.height))
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

            // Append frame
            let pts = CMTimeMultiply(frameDuration, multiplier: Int32(frameIndex))
            if !adaptor.append(pixelBuffer, withPresentationTime: pts) {
              encodeError = writer.error ?? NSError(domain: "VideoEncoder", code: 7, userInfo: [NSLocalizedDescriptionKey: "Failed to append frame \(frameIndex)"])
              
              return
            }
            frameIndex += 1

            // Emit progress on the main queue (RCTEventEmitter requires it)
            if self?.hasListeners == true {
              let body: [String: Any] = [
                "framesEncoded": frameIndex,
                "totalFrames": totalFrames,
              ]
              DispatchQueue.main.async {
                self?.sendEvent(withName: "onEncodeProgress", body: body)
              }
            }
          }

          // Break out of the while loop if an error occurred inside autoreleasepool
          if encodeError != nil { break }
        }
      }
    }
  }
}
