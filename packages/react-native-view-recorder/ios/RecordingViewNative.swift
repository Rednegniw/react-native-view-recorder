// Native backing view for the RecordingView component.
// Registers itself in a thread-safe weak-value map keyed by sessionId
// so ViewRecorder can look up the live UIView for frame capture.

import UIKit

@objcMembers
public class RecordingViewNative: UIView {

  // Weak-value map: doesn't prevent the view from being deallocated
  private static let registry = NSMapTable<NSString, RecordingViewNative>.strongToWeakObjects()
  private static let registryQueue = DispatchQueue(label: "com.viewrecorder.registry")

  static func view(forSession id: String) -> RecordingViewNative? {
    registryQueue.sync { registry.object(forKey: id as NSString) }
  }

  private static func register(_ view: RecordingViewNative, forSession id: String) {
    registryQueue.sync { registry.setObject(view, forKey: id as NSString) }
  }

  private static func unregister(session id: String) {
    registryQueue.sync { registry.removeObject(forKey: id as NSString) }
  }

  // ── Session ID prop ────────────────────────────────────────────

  public var sessionId: String = "" {
    didSet {
      if !oldValue.isEmpty {
        RecordingViewNative.unregister(session: oldValue)
      }

      if !sessionId.isEmpty {
        RecordingViewNative.register(self, forSession: sessionId)
      }
    }
  }

  deinit {
    if !sessionId.isEmpty {
      let id = sessionId
      RecordingViewNative.registryQueue.async {
        RecordingViewNative.registry.removeObject(forKey: id as NSString)
      }
    }
  }
}
