jest.mock("../src/NativeViewRecorder", () => ({
  __esModule: true,
  default: null,
}));

import type {
  FrameInfo,
  RecordOptions,
  RecordProgress,
  VideoCodec,
  ViewRecorder,
} from "../src/index";
import * as lib from "../src/index";

describe("public API exports", () => {
  test("exports useViewRecorder as a function", () => {
    expect(typeof lib.useViewRecorder).toBe("function");
  });

  test("exports RecordingView", () => {
    expect(lib.RecordingView).toBeDefined();
  });

  test("exports useSkiaViewRecorder as a function", () => {
    expect(typeof lib.useSkiaViewRecorder).toBe("function");
  });

  test("exports SkiaRecordingView", () => {
    expect(lib.SkiaRecordingView).toBeDefined();
  });

  test("type exports compile correctly", () => {
    // These type assertions verify the types exist at compile time.
    // If any type is missing, ts-jest will fail to compile this file.
    const _frameInfo: FrameInfo = { frameIndex: 0, totalFrames: 1 };
    const _recordProgress: RecordProgress = {
      framesEncoded: 1,
      totalFrames: 1,
    };
    const _codec: VideoCodec = "hevc";
    const _options: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      totalFrames: 1,
    };
    const _recorder: ViewRecorder = {
      sessionId: "test",
      record: async () => "/out.mp4",
      stop: () => {},
    };

    expect(_frameInfo).toBeDefined();
    expect(_recordProgress).toBeDefined();
    expect(_codec).toBeDefined();
    expect(_options).toBeDefined();
    expect(_recorder).toBeDefined();
  });

  test("exports AbortError class with correct name", () => {
    expect(lib.AbortError).toBeDefined();
    const err = new lib.AbortError();
    expect(err.name).toBe("AbortError");
    expect(err.message).toBe("Recording was aborted");
    expect(err instanceof Error).toBe(true);
  });

  test("does not export NativeViewRecorder (internal)", () => {
    expect((lib as Record<string, unknown>).NativeViewRecorder).toBeUndefined();
  });
});
