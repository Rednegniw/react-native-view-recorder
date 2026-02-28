// Objective-C bridge for the Swift ViewRecorder module.

#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (ViewRecorder, RCTEventEmitter)

RCT_EXTERN_METHOD(startSession : (NSDictionary *)options resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(captureFrame : (NSString *)sessionId resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(captureSkiaFrame : (NSString *)sessionId skiaViewTag : (nonnull NSNumber *)
                      skiaViewTag resolver : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(finishSession : (NSString *)sessionId resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
