import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export const RecIndicator = () => {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 800 }), -1, true);
  }, [opacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View
      style={{
        position: "absolute",
        top: insets.top + 12,
        left: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        zIndex: 10,
      }}
    >
      <Animated.View
        style={[
          {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.recording,
          },
          dotStyle,
        ]}
      />
      <Text
        style={{
          color: colors.recording,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1,
        }}
      >
        REC
      </Text>
    </View>
  );
};
