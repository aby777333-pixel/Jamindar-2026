import { View, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, space, type as T } from "@/lib/theme";
import { elevation } from "./ui";

type TabRoute = { key: string; name: string };
type TabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, any>;
  navigation: any;
};

/** Custom floating 3D bottom tab bar with a raised active pill. */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        marginHorizontal: space.sm,
        marginBottom: Math.max(insets.bottom, space.xs) + space.xxs,
        borderRadius: space.md,
        paddingVertical: space.xs,
        paddingHorizontal: space.xs,
        borderWidth: 1,
        borderColor: colors.border,
        borderTopColor: "#FFFFFF",
        ...elevation.card,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const focused = state.index === index;
        const color = focused ? colors.brand : colors.inkFaint;

        const onPress = () => {
          Haptics.selectionAsync().catch(() => {});
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: space.xs,
                paddingHorizontal: space.sm,
                borderRadius: space.sm,
                backgroundColor: focused ? colors.brandSoft : "transparent",
                transform: [{ translateY: focused ? -2 : 0 }],
                ...(focused ? elevation.low : null),
              }}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text
                style={{
                  color,
                  fontSize: T.caption.fontSize + 1,
                  fontWeight: focused ? "700" : "600",
                  marginTop: 3,
                }}
              >
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
