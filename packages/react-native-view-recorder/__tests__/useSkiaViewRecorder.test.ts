import { findNodeHandle } from "react-native";

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
import { useSkiaViewRecorder } from "../src/SkiaRecordingView";

const baseOptions: RecordOptions = {
  output: "/path/to/video.mp4",
  fps: 30,
  totalFrames: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  (findNodeHandle as jest.Mock).mockReturnValue(null);
});

describe("useSkiaViewRecorder", () => {
  describe("session identity", () => {
    test("returns sessionId, record, and skiaViewRef", () => {
      const result = useSkiaViewRecorder();

      expect(result.sessionId).toMatch(/^vr_\d+_\d+$/);
      expect(typeof result.record).toBe("function");
      expect(result.skiaViewRef).toEqual({ current: null });
    });
  });

  describe("Skia frame capture path", () => {
    test("calls captureSkiaFrame when skiaViewRef is set and findNodeHandle returns a viewTag", async () => {
      const { sessionId, record, skiaViewRef } = useSkiaViewRecorder();

      Object.assign(skiaViewRef, { current: {} });
      (findNodeHandle as jest.Mock).mockReturnValue(42);

      await record(baseOptions);

      expect(mockNative.captureSkiaFrame).toHaveBeenCalledTimes(3);
      for (const call of mockNative.captureSkiaFrame.mock.calls) {
        expect(call[0]).toBe(sessionId);
        expect(call[1]).toBe(42);
      }
      expect(mockNative.captureFrame).not.toHaveBeenCalled();
    });
  });

  describe("fallback to regular capture", () => {
    test("falls back to captureFrame when skiaViewRef.current is null", async () => {
      const { record } = useSkiaViewRecorder();

      await record(baseOptions);

      expect(mockNative.captureFrame).toHaveBeenCalledTimes(3);
      expect(mockNative.captureSkiaFrame).not.toHaveBeenCalled();
    });

    test("falls back to captureFrame when findNodeHandle returns null", async () => {
      const { record, skiaViewRef } = useSkiaViewRecorder();

      Object.assign(skiaViewRef, { current: {} });
      (findNodeHandle as jest.Mock).mockReturnValue(null);

      await record(baseOptions);

      expect(mockNative.captureFrame).toHaveBeenCalledTimes(3);
      expect(mockNative.captureSkiaFrame).not.toHaveBeenCalled();
    });
  });

  describe("shared orchestration behavior", () => {
    test("calls startSession and finishSession correctly", async () => {
      const { sessionId, record } = useSkiaViewRecorder();

      const result = await record(baseOptions);

      expect(mockNative.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          output: baseOptions.output,
          fps: baseOptions.fps,
        }),
      );
      expect(mockNative.finishSession).toHaveBeenCalledWith(sessionId);
      expect(result).toBe("/output.mp4");
    });

    test("calls onFrame and onProgress callbacks correctly", async () => {
      const { record } = useSkiaViewRecorder();
      const onFrame = jest.fn();
      const onProgress = jest.fn();

      await record({ ...baseOptions, totalFrames: 2, onFrame, onProgress });

      expect(onFrame).toHaveBeenCalledTimes(2);
      expect(onFrame).toHaveBeenNthCalledWith(1, {
        frameIndex: 0,
        totalFrames: 2,
      });
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(2, {
        framesEncoded: 2,
        totalFrames: 2,
      });
    });

    test("handles captureFrame errors with cleanup", async () => {
      const { record } = useSkiaViewRecorder();

      mockNative.captureFrame.mockRejectedValueOnce(new Error("capture failed"));

      await expect(record(baseOptions)).rejects.toThrow("capture failed");
      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
    });

    test("handles captureSkiaFrame errors with cleanup", async () => {
      const { record, skiaViewRef } = useSkiaViewRecorder();

      Object.assign(skiaViewRef, { current: {} });
      (findNodeHandle as jest.Mock).mockReturnValue(42);
      mockNative.captureSkiaFrame.mockRejectedValueOnce(new Error("skia capture failed"));

      await expect(record(baseOptions)).rejects.toThrow("skia capture failed");
      expect(mockNative.finishSession).toHaveBeenCalledTimes(1);
    });

    test("prevents concurrent recording", async () => {
      const { record } = useSkiaViewRecorder();

      let resolveStart!: () => void;
      mockNative.startSession.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveStart = resolve;
          }),
      );

      const first = record(baseOptions);

      await expect(record(baseOptions)).rejects.toThrow("A recording is already in progress.");

      resolveStart();
      await first;
    });
  });
});
