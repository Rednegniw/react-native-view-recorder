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
    const _frameInfo: FrameInfo<number> = { frameIndex: 0, totalFrames: 1 };
    const _recordProgress: RecordProgress<number> = {
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

  test("totalFrames narrows callback types", () => {
    // With totalFrames: callbacks get totalFrames: number
    const _withFrames: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      totalFrames: 100,
      onFrame: ({ totalFrames }) => {
        const _n: number = totalFrames;
        void _n;
      },
      onProgress: ({ totalFrames }) => {
        const _n: number = totalFrames;
        void _n;
      },
    };

    // Without totalFrames: callbacks get totalFrames: undefined
    const _eventDriven: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      onFrame: ({ totalFrames }) => {
        const _u: undefined = totalFrames;
        void _u;
      },
      onProgress: ({ totalFrames }) => {
        const _u: undefined = totalFrames;
        void _u;
      },
    };

    expect(_withFrames).toBeDefined();
    expect(_eventDriven).toBeDefined();
  });

  test("audioFile and mixAudio are mutually exclusive at type level", () => {
    // audioFile alone: OK
    const _withFile: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      totalFrames: 1,
      audioFile: { path: "/audio.wav" },
    };

    // mixAudio alone: OK
    const _withMix: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      totalFrames: 1,
      mixAudio: () => null,
    };

    // Neither: OK
    const _noAudio: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      totalFrames: 1,
    };

    // Both: should be a type error
    // @ts-expect-error audioFile and mixAudio cannot be combined
    const _both: RecordOptions = {
      output: "/out.mp4",
      fps: 30,
      totalFrames: 1,
      audioFile: { path: "/audio.wav" },
      mixAudio: () => null,
    };

    expect(_withFile).toBeDefined();
    expect(_withMix).toBeDefined();
    expect(_noAudio).toBeDefined();
    expect(_both).toBeDefined();
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
