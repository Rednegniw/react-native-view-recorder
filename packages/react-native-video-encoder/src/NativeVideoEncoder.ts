import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

type EncodeOptions = {
  folder: string;
  fps: number;
  width: number;
  height: number;
  output: string;
  codec?: string;
  bitrate?: number;
  quality?: number;
  keyFrameInterval?: number;
  optimizeForNetwork?: boolean;
};

export interface Spec extends TurboModule {
  encode(options: EncodeOptions): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>("VideoEncoder");
