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
};

export interface Spec extends TurboModule {
  startSession(options: SessionOptions): Promise<void>;
  captureFrame(sessionId: string): Promise<void>;
  captureSkiaFrame(sessionId: string, skiaViewTag: number): Promise<void>;
  finishSession(sessionId: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>("ViewRecorder");
