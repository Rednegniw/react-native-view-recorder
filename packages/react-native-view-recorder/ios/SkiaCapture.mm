// Zero-copy Skia frame capture implementation.
// Conditionally compiled: only active when @shopify/react-native-skia is installed.

#import "SkiaCapture.h"

#if __has_include("RNSkView.h")

#import "RNSkView.h"
#import "RNSkAppleView.h"
#import "MetalContext.h"

#import <include/core/SkSurface.h>
#import <include/core/SkCanvas.h>
#import <include/gpu/ganesh/GrBackendSurface.h>
#import <include/gpu/ganesh/GrDirectContext.h>
#import <include/gpu/ganesh/mtl/GrMtlBackendSurface.h>
#import <include/gpu/ganesh/SkSurfaceGanesh.h>

#import <CoreVideo/CVMetalTextureCache.h>
#import <Metal/Metal.h>

/**
 * Canvas provider that wraps a CVPixelBuffer-backed SkSurface.
 * When Skia's renderer calls renderToCanvas, drawing commands
 * go directly into the encoder's pixel buffer memory.
 */
class CVPixelBufferCanvasProvider : public RNSkia::RNSkCanvasProvider {
public:
  CVPixelBufferCanvasProvider(sk_sp<SkSurface> surface, int width, int height)
    : RNSkCanvasProvider([]() {}), _surface(std::move(surface)), _width(width), _height(height) {}

  bool renderToCanvas(const std::function<void(SkCanvas *)> &cb) override {
    if (!_surface) return false;
    cb(_surface->getCanvas());
    return true;
  }

  int getWidth() override { return _width; }
  int getHeight() override { return _height; }

private:
  sk_sp<SkSurface> _surface;
  int _width;
  int _height;
};

// Cached texture cache (created once, reused across frames)
static CVMetalTextureCacheRef sTextureCache = nil;

static CVMetalTextureCacheRef getTextureCache(id<MTLDevice> device) {
  if (!sTextureCache) {
    CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &sTextureCache);
  }
  return sTextureCache;
}

@implementation SkiaCapture

+ (BOOL)renderSkiaView:(UIView *)skiaUIView
         toPixelBuffer:(CVPixelBufferRef)pixelBuffer
                  width:(int)width
                 height:(int)height
                  error:(NSError **)error {

  // Get the Skia view implementation from the SkiaUIView
  SEL implSel = NSSelectorFromString(@"impl");
  if (![skiaUIView respondsToSelector:implSel]) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:1
      userInfo:@{NSLocalizedDescriptionKey: @"View is not a SkiaUIView"}];
    return NO;
  }

  // Call [skiaUIView impl] to get the shared_ptr<RNSkBaseAppleView>
  typedef std::shared_ptr<RNSkBaseAppleView> (*ImplIMP)(id, SEL);
  ImplIMP implFunc = (ImplIMP)[skiaUIView methodForSelector:implSel];
  auto appleView = implFunc(skiaUIView, implSel);

  if (!appleView) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:2
      userInfo:@{NSLocalizedDescriptionKey: @"SkiaUIView impl is null"}];
    return NO;
  }

  auto drawView = appleView->getDrawView();
  if (!drawView) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:3
      userInfo:@{NSLocalizedDescriptionKey: @"Skia draw view is null"}];
    return NO;
  }

  auto renderer = drawView->getRenderer();
  if (!renderer) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:4
      userInfo:@{NSLocalizedDescriptionKey: @"Skia renderer is null"}];
    return NO;
  }

  // Get Skia's Metal context (thread-local singleton)
  auto &metalCtx = MetalContext::getInstance();
  GrDirectContext *grContext = metalCtx.getDirectContext();
  if (!grContext) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:5
      userInfo:@{NSLocalizedDescriptionKey: @"Skia GrDirectContext is null"}];
    return NO;
  }

  // Get the Metal device from the texture cache creation
  // (MetalContext creates it internally, we use MTLCreateSystemDefaultDevice for ours)
  id<MTLDevice> device = MTLCreateSystemDefaultDevice();
  CVMetalTextureCacheRef cache = getTextureCache(device);
  if (!cache) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:6
      userInfo:@{NSLocalizedDescriptionKey: @"Failed to create CVMetalTextureCache"}];
    return NO;
  }

  // Create a Metal texture from the CVPixelBuffer (zero-copy via IOSurface)
  CVMetalTextureRef cvTexture = nil;
  CVReturn result = CVMetalTextureCacheCreateTextureFromImage(
    kCFAllocatorDefault, cache, pixelBuffer, nil,
    MTLPixelFormatBGRA8Unorm, width, height, 0, &cvTexture);

  if (result != kCVReturnSuccess || !cvTexture) {
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:7
      userInfo:@{NSLocalizedDescriptionKey:
        [NSString stringWithFormat:@"CVMetalTextureCacheCreateTextureFromImage failed: %d", result]}];
    return NO;
  }

  id<MTLTexture> metalTexture = CVMetalTextureGetTexture(cvTexture);
  if (!metalTexture) {
    CFRelease(cvTexture);
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:8
      userInfo:@{NSLocalizedDescriptionKey: @"CVMetalTextureGetTexture returned nil"}];
    return NO;
  }

  // Wrap the Metal texture as a Skia SkSurface
  GrMtlTextureInfo textureInfo;
  textureInfo.fTexture.retain((__bridge void *)metalTexture);

  GrBackendTexture backendTexture =
    GrBackendTextures::MakeMtl(width, height, skgpu::Mipmapped::kNo, textureInfo);

  auto surface = SkSurfaces::WrapBackendTexture(
    grContext, backendTexture, kTopLeft_GrSurfaceOrigin, 0,
    kBGRA_8888_SkColorType, nullptr, nullptr, nil, nil);

  if (!surface) {
    CFRelease(cvTexture);
    if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:9
      userInfo:@{NSLocalizedDescriptionKey: @"Failed to create SkSurface from Metal texture"}];
    return NO;
  }

  // The Skia picture contains drawing commands in view point coordinates.
  // The renderer applies canvas->scale(pixelDensity, pixelDensity) before drawing.
  // We need a pre-scale so the combined transform maps points to output pixels:
  //   preScale * pixelDensity = outputSize / viewPointSize
  //   preScale = outputSize / (viewPointSize * pixelDensity)
  CGFloat viewWidth = skiaUIView.bounds.size.width;
  CGFloat viewHeight = skiaUIView.bounds.size.height;
  CGFloat pd = skiaUIView.contentScaleFactor;

  if (viewWidth > 0 && viewHeight > 0 && pd > 0) {
    float sx = (float)width / (viewWidth * pd);
    float sy = (float)height / (viewHeight * pd);
    surface->getCanvas()->scale(sx, sy);
  }

  // Create our custom canvas provider and render
  auto provider = std::make_shared<CVPixelBufferCanvasProvider>(surface, width, height);
  renderer->renderImmediate(provider);

  // Flush GPU work to ensure all drawing is committed to the Metal texture
  grContext->flushAndSubmit(GrSyncCpu::kYes);

  // Release the CVMetalTextureRef (pixel buffer memory is still valid)
  CFRelease(cvTexture);

  return YES;
}

@end

#else // Skia not available

@implementation SkiaCapture

+ (BOOL)renderSkiaView:(UIView *)skiaUIView
         toPixelBuffer:(CVPixelBufferRef)pixelBuffer
                  width:(int)width
                 height:(int)height
                  error:(NSError **)error {
  if (error) *error = [NSError errorWithDomain:@"SkiaCapture" code:100
    userInfo:@{NSLocalizedDescriptionKey:
      @"@shopify/react-native-skia is not installed. SkiaRecordingView requires it as a peer dependency."}];
  return NO;
}

@end

#endif
