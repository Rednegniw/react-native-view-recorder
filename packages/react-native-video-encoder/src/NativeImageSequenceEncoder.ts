import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  encode(options: object): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>("ImageSequenceEncoder");
