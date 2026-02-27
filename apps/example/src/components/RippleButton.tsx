import type React from "react";
import type { ViewStyle } from "react-native";
import { Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface RippleButtonProps {
  onPress: () => void;
  label: string;
  style?: ViewStyle;
  disabled?: boolean;
  variant?: "primary" | "success" | "secondary";
  children?: React.ReactNode;
}

const FADE_OUT = { duration: 350 };

const VARIANTS = {
  primary: {
    bg: "#007AFF",
    text: "#fff",
    ripple: "rgba(255, 255, 255, 0.2)",
  },
  success: {
    bg: "#34C759",
    text: "#fff",
    ripple: "rgba(255, 255, 255, 0.2)",
  },
  secondary: {
    bg: "#333",
    text: "#fff",
    ripple: "rgba(255, 255, 255, 0.12)",
  },
};

export const RippleButton = ({
  onPress,
  label,
  style,
  disabled,
  variant = "primary",
  children,
}: RippleButtonProps) => {
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  const colors = VARIANTS[variant];

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin((e) => {
      "worklet";
      touchX.value = e.x;
      touchY.value = e.y;
      scale.value = 0;
      opacity.value = 1;
      scale.value = withTiming(1, { duration: 200 });
    })
    .onEnd(() => {
      "worklet";
      runOnJS(onPress)();
      opacity.value = withTiming(0, FADE_OUT);
    })
    .onTouchesUp(() => {
      "worklet";
      opacity.value = withTiming(0, FADE_OUT);
    })
    .onTouchesCancelled(() => {
      "worklet";
      opacity.value = withTiming(0, FADE_OUT);
    });

  const rippleStyle = useAnimatedStyle(() => {
    const maxRadius = Math.sqrt(
      Math.max(touchX.value, width.value - touchX.value) ** 2 +
        Math.max(touchY.value, height.value - touchY.value) ** 2,
    );
    const diameter = maxRadius * 2;

    return {
      position: "absolute",
      left: touchX.value - maxRadius,
      top: touchY.value - maxRadius,
      width: diameter,
      height: diameter,
      borderRadius: maxRadius,
      backgroundColor: colors.ripple,
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
          height.value = e.nativeEvent.layout.height;
        }}
        style={[
          {
            overflow: "hidden",
            backgroundColor: colors.bg,
            borderRadius: 12,
            paddingHorizontal: 28,
            paddingVertical: 14,
            alignItems: "center",
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <Animated.View pointerEvents="none" style={rippleStyle} />
        {children ?? (
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{label}</Text>
        )}
      </Animated.View>
    </GestureDetector>
  );
};
