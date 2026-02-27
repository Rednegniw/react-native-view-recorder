// Objective-C bridge for the Swift VideoEncoder module.

#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VideoEncoder, RCTEventEmitter)

RCT_EXTERN_METHOD(encode:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
