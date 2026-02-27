//
//  ImageSequenceEncoder.m
//  react-native-image-sequence-encoder
//
//  Objective-C bridge for Swift module
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ImageSequenceEncoder, NSObject)

RCT_EXTERN_METHOD(encode:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
