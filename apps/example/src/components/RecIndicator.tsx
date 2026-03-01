import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../theme/colors";

export const RecIndicator = () => {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.3, { duration: 800 }), -1, true);
  }, [opacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
