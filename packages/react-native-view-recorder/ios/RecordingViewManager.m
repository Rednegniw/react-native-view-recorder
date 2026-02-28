// ObjC view manager for RecordingViewNative (Fabric interop layer).

#import <React/RCTViewManager.h>

#if __has_include("react_native_view_recorder-Swift.h")
#import "react_native_view_recorder-Swift.h"
#else
#import <react_native_view_recorder/react_native_view_recorder-Swift.h>
#endif

@interface RecordingViewManager : RCTViewManager
@end

@implementation RecordingViewManager

RCT_EXPORT_MODULE(RecordingView)

- (UIView *)view
{
  return [RecordingViewNative new];
}

RCT_EXPORT_VIEW_PROPERTY(sessionId, NSString)

@end
