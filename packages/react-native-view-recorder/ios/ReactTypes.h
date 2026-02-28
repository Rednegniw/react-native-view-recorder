// Forward declarations of React Native types used by Swift code.
// These avoid importing the full React module (which has a broken umbrella header
// in prebuilt RN 0.83). The actual implementations are linked from React-Core.

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

typedef void (^RCTPromiseResolveBlock)(id _Nullable result);
typedef void (^RCTPromiseRejectBlock)(NSString * _Nonnull code,
                                      NSString * _Nullable message,
                                      NSError * _Nullable error);

@interface RCTEventEmitter : NSObject

+ (NSString * _Nullable)moduleName;
+ (BOOL)requiresMainQueueSetup;
- (NSArray<NSString *> * _Nullable)supportedEvents;
- (void)invalidate;

@end
