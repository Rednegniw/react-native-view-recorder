import type { HostComponent, ViewProps } from "react-native";
import { codegenNativeComponent } from "react-native";

export interface NativeProps extends ViewProps {
  sessionId: string;
}

export default codegenNativeComponent<NativeProps>("RecordingView") as HostComponent<NativeProps>;
