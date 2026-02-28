import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useLayoutEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { findDemoEntry } from "../config/demoRegistry";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Demo">;

export const DemoScreen = ({ route, navigation }: Props) => {
  const { demoKey } = route.params;
  const entry = findDemoEntry(demoKey);
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({ title: entry?.title ?? "Demo" });
  }, [navigation, entry]);

  if (!entry) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: colors.textSecondary }}>Demo not found</Text>
      </View>
    );
  }

  const DemoComponent = entry.Component;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: insets.bottom + 20,
      }}
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: colors.background }}
    >
      {/* Description */}
      <Text
        style={{
          fontSize: 13,
          color: colors.textSecondary,
          lineHeight: 18,
          marginBottom: 16,
        }}
      >
        {entry.description}
      </Text>

      {/* Demo content */}
      <DemoComponent />
    </ScrollView>
  );
};
