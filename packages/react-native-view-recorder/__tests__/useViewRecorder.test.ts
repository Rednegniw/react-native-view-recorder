const mockNative = {
  startSession: jest.fn().mockResolvedValue(undefined),
  captureFrame: jest.fn().mockResolvedValue(undefined),
  captureSkiaFrame: jest.fn().mockResolvedValue(undefined),
  finishSession: jest.fn().mockResolvedValue("/output.mp4"),
};

jest.mock("../src/NativeViewRecorder", () => ({
  __esModule: true,
  default: mockNative,
}));

import type { RecordOptions } from "../src/RecordingView";
import { useViewRecorder } from "../src/RecordingView";

const baseOptions: RecordOptions = {
  output: "/path/to/video.mp4",
  fps: 30,
  totalFrames: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useViewRecorder", () => {
  describe("session identity", () => {
    test("returns a sessionId matching the pattern vr_{id}_{timestamp}", () => {
      const { sessionId } = useViewRecorder();
      expect(sessionId).toMatch(/^vr_\d+_\d+$/);
    });

    test("returns a record function", () => {
      const { record } = useViewRecorder();
      expect(typeof record).toBe("function");
    });
  });

  describe("record() happy path", () => {
    test("calls startSession with sessionId and native options", async () => {
      const { sessionId, record } = useViewRecorder();

      await record({
        output: "/out.mp4",
        fps: 60,
        totalFrames: 1,
        width: 640,
        height: 480,
        codec: "h264",
        bitrate: 5_000_000,
        quality: 0.8,
        keyFrameInterval: 1,
        optimizeForNetwork: false,
      });

      expect(mockNative.startSession).toHaveBeenCalledWith({
        sessionId,
        output: "/out.mp4",
        fps: 60,
        width: 640,
        height: 480,
        codec: "h264",
        bitrate: 5_000_000,
        quality: 0.8,
        keyFrameInterval: 1,
        optimizeForNetwork: false,
      });
    });

    test("does not pass onFrame, onProgress, or totalFrames to startSession", async () => {
      const { record } = useViewRecorder();
      const onFrame = jest.fn();
      const onProgress = jest.fn();

      await record({ ...baseOptions, onFrame, onProgress });

      const sessionArg = mockNative.startSession.mock.calls[0][0];
      expect(sessionArg).not.toHaveProperty("onFrame");
      expect(sessionArg).not.toHaveProperty("onProgress");
      expect(sessionArg).not.toHaveProperty("totalFrames");
    });

    test("loops exactly totalFrames times", async () => {
      const { record } = useViewRecorder();

      await record(baseOptions);

      expect(mockNative.captureFrame).toHaveBeenCalledTimes(3);
    });

    test("calls captureFrame with sessionId for each frame", async () => {
      const { sessionId, record } = useViewRecorder();

      await record(baseOptions);

      for (const call of mockNative.captureFrame.mock.calls) {
        expect(call[0]).toBe(sessionId);
      }
    });

    test("calls finishSession exactly once with sessionId after all frames", async () => {
      const { sessionId, record } = useViewRecorder();

      await record(baseOptions);

      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
      expect(mockNative.finishSession).toHaveBeenCalledWith(sessionId);
    });

    test("returns the output path from finishSession", async () => {
      const { record } = useViewRecorder();

      const result = await record(baseOptions);

      expect(result).toBe("/output.mp4");
    });
  });

  describe("callbacks", () => {
    test("calls onFrame with correct { frameIndex, totalFrames } for each frame", async () => {
      const { record } = useViewRecorder();
      const onFrame = jest.fn();

      await record({ ...baseOptions, onFrame });

      expect(onFrame).toHaveBeenCalledTimes(3);
      expect(onFrame).toHaveBeenNthCalledWith(1, {
        frameIndex: 0,
        totalFrames: 3,
      });
      expect(onFrame).toHaveBeenNthCalledWith(2, {
        frameIndex: 1,
        totalFrames: 3,
      });
      expect(onFrame).toHaveBeenNthCalledWith(3, {
        frameIndex: 2,
        totalFrames: 3,
      });
    });

    test("calls onProgress with correct { framesEncoded, totalFrames } after each frame", async () => {
      const { record } = useViewRecorder();
      const onProgress = jest.fn();

      await record({ ...baseOptions, onProgress });

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, {
        framesEncoded: 1,
        totalFrames: 3,
      });
      expect(onProgress).toHaveBeenNthCalledWith(2, {
        framesEncoded: 2,
        totalFrames: 3,
      });
      expect(onProgress).toHaveBeenNthCalledWith(3, {
        framesEncoded: 3,
        totalFrames: 3,
      });
    });

    test("per frame: onFrame -> raf -> captureFrame -> onProgress in exact order", async () => {
      const order: string[] = [];

      const rafSpy = jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
        order.push("raf");
        cb(0);
        return 0;
      });

      mockNative.captureFrame.mockImplementation(async () => {
        order.push("captureFrame");
      });

      const onFrame = jest.fn(async () => {
        order.push("onFrame");
      });
      const onProgress = jest.fn(() => {
        order.push("onProgress");
      });

      const { record } = useViewRecorder();
      await record({
        ...baseOptions,
        totalFrames: 2,
        onFrame,
        onProgress,
      });

      expect(order).toEqual([
        "onFrame",
        "raf",
        "captureFrame",
        "onProgress",
        "onFrame",
        "raf",
        "captureFrame",
        "onProgress",
      ]);

      rafSpy.mockRestore();
    });

    test("waits for async onFrame promise before proceeding to captureFrame", async () => {
      const order: string[] = [];

      mockNative.captureFrame.mockImplementation(async () => {
        order.push("captureFrame");
      });

      const onFrame = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            order.push("onFrame:start");
            // Simulate async work
            Promise.resolve().then(() => {
              order.push("onFrame:end");
              resolve();
            });
          }),
      );

      const { record } = useViewRecorder();
      await record({ ...baseOptions, totalFrames: 1, onFrame });

      expect(order.indexOf("onFrame:end")).toBeLessThan(order.indexOf("captureFrame"));
    });
  });

  describe("optional callbacks", () => {
    test("works without onFrame callback", async () => {
      const { record } = useViewRecorder();
      const onProgress = jest.fn();

      const result = await record({ ...baseOptions, onProgress });

      expect(result).toBe("/output.mp4");
      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    test("works without onProgress callback", async () => {
      const { record } = useViewRecorder();
      const onFrame = jest.fn();

      const result = await record({ ...baseOptions, onFrame });

      expect(result).toBe("/output.mp4");
      expect(onFrame).toHaveBeenCalledTimes(3);
    });

    test("works without either callback", async () => {
      const { record } = useViewRecorder();

      const result = await record(baseOptions);

      expect(result).toBe("/output.mp4");
    });
  });

  describe("edge cases", () => {
    test("totalFrames=0: calls startSession, skips loop, calls finishSession", async () => {
      const { record } = useViewRecorder();

      const result = await record({ ...baseOptions, totalFrames: 0 });

      expect(mockNative.startSession).toHaveBeenCalledTimes(1);
      expect(mockNative.captureFrame).not.toHaveBeenCalled();
      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
      expect(result).toBe("/output.mp4");
    });
  });

  describe("concurrent recording prevention", () => {
    test("throws if record() called while another is running", async () => {
      const { record } = useViewRecorder();

      // Make startSession hang so the first recording stays in progress
      let resolveStart!: () => void;
      mockNative.startSession.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveStart = resolve;
          }),
      );

      const first = record(baseOptions);

      await expect(record(baseOptions)).rejects.toThrow("A recording is already in progress.");

      // Cleanup: resolve the hanging promise
      resolveStart();
      await first;
    });

    test("allows recording again after previous recording completes", async () => {
      const { record } = useViewRecorder();

      await record(baseOptions);
      const result = await record(baseOptions);

      expect(result).toBe("/output.mp4");
    });

    test("allows recording again after previous recording fails", async () => {
      const { record } = useViewRecorder();

      mockNative.startSession.mockRejectedValueOnce(new Error("native error"));

      await expect(record(baseOptions)).rejects.toThrow("native error");

      // Should be able to record again
      const result = await record(baseOptions);
      expect(result).toBe("/output.mp4");
    });
  });

  describe("native module not linked", () => {
    test("throws LINKING_ERROR when NativeViewRecorder is null", async () => {
      jest.resetModules();
      jest.doMock("../src/NativeViewRecorder", () => ({
        __esModule: true,
        default: null,
      }));

      const { useViewRecorder: useViewRecorderUnlinked } = require("../src/RecordingView");
      const { record } = useViewRecorderUnlinked();

      await expect(record(baseOptions)).rejects.toThrow("Native module not linked");
    });
  });

  describe("error handling and cleanup", () => {
    test("if startSession rejects: calls finishSession for cleanup, re-throws", async () => {
      const { record } = useViewRecorder();
      const error = new Error("start failed");

      mockNative.startSession.mockRejectedValueOnce(error);

      await expect(record(baseOptions)).rejects.toThrow("start failed");
      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
    });

    test("if captureFrame rejects mid-loop: calls finishSession for cleanup, re-throws", async () => {
      const { record } = useViewRecorder();

      mockNative.captureFrame
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("capture failed"));

      await expect(record(baseOptions)).rejects.toThrow("capture failed");
      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
    });

    test("if finishSession rejects during cleanup: swallows cleanup error, re-throws original", async () => {
      const { record } = useViewRecorder();

      mockNative.startSession.mockRejectedValueOnce(new Error("original error"));
      mockNative.finishSession.mockRejectedValueOnce(new Error("cleanup error"));

      await expect(record(baseOptions)).rejects.toThrow("original error");
    });

    test("if onFrame callback throws: calls finishSession for cleanup, re-throws", async () => {
      const { record } = useViewRecorder();
      const onFrame = jest.fn().mockRejectedValue(new Error("frame error"));

      await expect(record({ ...baseOptions, onFrame })).rejects.toThrow("frame error");
      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
    });

    test("after error, isRecordingRef is reset (can record again)", async () => {
      const { record } = useViewRecorder();

      mockNative.captureFrame.mockRejectedValueOnce(new Error("capture failed"));

      await expect(record(baseOptions)).rejects.toThrow("capture failed");

      // Should not throw "already in progress"
      const result = await record(baseOptions);
      expect(result).toBe("/output.mp4");
    });
  });
});
