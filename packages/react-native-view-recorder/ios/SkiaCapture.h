/**
 * Zero-copy Skia frame capture for iOS.
 * Renders Skia content directly into a CVPixelBuffer via Metal,
 * bypassing drawHierarchy which cannot capture CAMetalLayer content.
 */

#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>

@interface SkiaCapture : NSObject

/**
 * Renders the Skia view's current content into the given CVPixelBuffer.
 * Uses a zero-copy pipeline: CVPixelBuffer → IOSurface → Metal texture → SkSurface,
 * then replays Skia's drawing commands directly into the encoder's memory.
 *
 * @param skiaUIView The SkiaUIView instance containing the Skia canvas
 * @param pixelBuffer The target CVPixelBuffer (must be BGRA, IOSurface-backed)
 * @param width Video output width in pixels
 * @param height Video output height in pixels
 * @param error Error output on failure
 * @return YES on success, NO on failure
 */
+ (BOOL)renderSkiaView:(UIView *)skiaUIView
         toPixelBuffer:(CVPixelBufferRef)pixelBuffer
                 width:(int)width
                height:(int)height
                 error:(NSError **)error;

@end
