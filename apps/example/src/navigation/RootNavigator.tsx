import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DemoScreen } from "../screens/DemoScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { colors } from "../theme/colors";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => (
  <Stack.Navigator
    id="RootStack"
    screenOptions={{
      headerBackButtonDisplayMode: "minimal",
      headerTintColor: colors.accent,
      headerTitleStyle: { fontWeight: "600" },
      headerStyle: { backgroundColor: colors.background },
      contentStyle: { backgroundColor: colors.background },
    }}
  >
    <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
    <Stack.Screen component={DemoScreen} name="Demo" />
  </Stack.Navigator>
);
