//
//  ImageSequenceEncoder.swift
//  react-native-image-sequence-encoder
//
//  Created on 2025-07-02
//

import Foundation
import AVFoundation
import VideoToolbox
import UIKit // UIImage
import React // RCTBridgeModule

@objc(ImageSequenceEncoder)
final class ImageSequenceEncoder: NSObject, RCTBridgeModule {

  // MARK: - React entry points -------------------------------------------------

  /// Name visible on the JS side (`NativeModules.ImageSequenceEncoder`)
  static func moduleName() -> String! { "ImageSequenceEncoder" }

  /// We do CPU-bound work off the main thread – no need to block UI startup.
  static func requiresMainQueueSetup() -> Bool { false }

  // MARK: - Public JS API ------------------------------------------------------

  /**
   * Encode a directory of `frame-00000.png …` into an H.264 MP4.
   *
   * JS side passes:
   * {
   *   folder: "/path/to/frames/",
   *   fps: 30,
   *   width: 1280,
   *   height: 720,
   *   output: "/path/to/movie.mp4"
   * }
   */
  @objc(encode:resolver:rejecter:)
  func encode(
    _ options: NSDictionary,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let params = try EncoderParams(dict: options)
        try Self.runEncode(params: params)
        resolver(params.output)
      } catch {
        rejecter("encode_error", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Internal helpers ---------------------------------------------------

  /// Typed parameter bundle
  private struct EncoderParams {
    let folder: String
    let fps: Int32
    let width: Int
    let height: Int
    let output: String

    init(dict: NSDictionary) throws {
      guard
        let folder = dict["folder"] as? String,
        let fps    = dict["fps"]    as? NSNumber,
        let width  = dict["width"]  as? NSNumber,
        let height = dict["height"] as? NSNumber,
        let output = dict["output"] as? String
      else { throw NSError(domain: "ImageSeqEncoder", code: 1,
                           userInfo: [NSLocalizedDescriptionKey : "Missing options"]) }

      self.folder = folder
      self.fps    = fps.int32Value
      self.width  = width.intValue
      self.height = height.intValue
      self.output = output
    }
  }

  /// Core encoding routine
  private static func runEncode(params p: EncoderParams) throws {

    // Clean any existing file at `output`
    try? FileManager.default.removeItem(atPath: p.output)

    // 1. Writer setup ---------------------------------------------------------
    let url = URL(fileURLWithPath: p.output)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)

    let settings: [String : Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: p.width,
      AVVideoHeightKey: p.height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 3_000_000,     // 3 Mbps
        AVVideoProfileLevelKey: kVTProfileLevel_H264_Main_AutoLevel
      ]
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    writer.add(input)

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String:  p.width,
        kCVPixelBufferHeightKey as String: p.height
      ])

    guard writer.startWriting() else { throw writer.error! }
    writer.startSession(atSourceTime: .zero)

    // 2. Enumerate PNG frames -------------------------------------------------
    let fileNames = try FileManager.default
      .contentsOfDirectory(atPath: p.folder)
      .sorted { $0.localizedStandardCompare($1) == .orderedAscending }

    var frameIdx: Int64 = 0
    let frameDuration = CMTime(value: 1, timescale: p.fps)

    for name in fileNames where name.hasSuffix(".png") {
      autoreleasepool {
        let path = p.folder + name
        guard let uiImg = UIImage(contentsOfFile: path),
              let cgImg = uiImg.cgImage
        else { return }

        guard let pxBufPool = adaptor.pixelBufferPool else { return }
        var pixelBufferOut: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pxBufPool, &pixelBufferOut)
        guard let pixelBuffer = pixelBufferOut else { return }

        // Draw UIImage into pixel buffer
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        let ctx = CGContext(
          data: CVPixelBufferGetBaseAddress(pixelBuffer),
          width: p.width,
          height: p.height,
          bitsPerComponent: 8,
          bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        )
        ctx?.draw(cgImg, in: CGRect(x: 0, y: 0, width: p.width, height: p.height))
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

        let presentationTime = CMTimeMultiply(frameDuration, multiplier: Int32(frameIdx))
        while !input.isReadyForMoreMediaData { usleep(2_000) } // back-pressure

        adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
        frameIdx += 1
      }
    }

    // 3. Finish ---------------------------------------------------------------
    input.markAsFinished()

    // finishWriting is asynchronous - we must wait for completion
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting {
      semaphore.signal()
    }
    semaphore.wait()

    if writer.status != .completed {
      throw writer.error ?? NSError(domain: "ImageSeqEncoder", code: 2,
                                    userInfo: [NSLocalizedDescriptionKey: "Unknown writer error, status: \(writer.status.rawValue)"])
    }
  }
}
