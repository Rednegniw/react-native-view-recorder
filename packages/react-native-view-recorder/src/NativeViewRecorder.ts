import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

type SessionOptions = {
  sessionId: string;
  fps: number;
  output: string;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  quality?: number;
  keyFrameInterval?: number;
  optimizeForNetwork?: boolean;
  hasMixAudio?: boolean;
  audioFilePath?: string;
  audioFileStartTime?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  audioBitrate?: number;
};

type SnapshotOptions = {
  sessionId: string;
  output?: string;
  format?: string;
  quality?: number;
  width?: number;
  height?: number;
  result?: string;
};

export interface Spec extends TurboModule {
  startSession(options: SessionOptions): Promise<void>;
  captureFrame(sessionId: string): Promise<void>;
  finishSession(sessionId: string): Promise<string>;
  cancelSession(sessionId: string): Promise<void>;
  writeAudioSamples(sessionId: string, samplesBase64: string): Promise<void>;
  takeSnapshot(options: SnapshotOptions): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>("ViewRecorder");
