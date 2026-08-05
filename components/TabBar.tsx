import { View, Pressable, Text, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { colors, space, type as T } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { elevation } from "./ui";

/**
 * Glass, but only where it earns its place (owner directive 05-08).
 *
 * This bar floats over scrolling content, which is the one surface in the app
 * where a real blur reads as depth rather than decoration — a chip or a card
 * sits on a flat background and would gain nothing.
 *
 * ⚠️ iOS ONLY, and that is a correction, not a preference. Enabling it on
 * Android produced the "double-layered background" in bug report 20: two
 * stacked surfaces under the tabs. Two Android behaviours combine to cause it —
 * an elevation shadow is drawn from the view's outline, so a frame that carries
 * `elevation` but no `backgroundColor` (the colour having moved onto the blur)
 * renders its shadow as a visible plate; and a native blur view is not reliably
 * clipped by a parent's `overflow: hidden` + `borderRadius`, so it draws its own
 * surface inside the frame. On iOS the blur is a real backdrop filter and both
 * problems are absent.
 *
 * expo-blur is also a no-op on react-native-web — a transparent tint there would
 * leave the bar see-through and the labels unreadable.
 *
 * So Android and web keep the single opaque bar they had before the design
 * pass, which is the appearance the report asks for.
 */
const GLASS = Platform.OS === "ios";

type TabRoute = { key: string; name: string };
type TabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, any>;
  navigation: any;
};

/** Custom floating 3D bottom tab bar with a raised active pill. */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const dark = useTheme((t) => t.mode) === "dark";

  // The frame carries the shape, border and shadow; the blur fills it. Both
  // must clip to the same radius or the glass squares off the corners.
  const frame = {
    marginHorizontal: space.sm,
    marginBottom: Math.max(insets.bottom, space.xs) + space.xxs,
    borderRadius: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: GLASS ? "rgba(255,255,255,0.55)" : "#FFFFFF",
    overflow: "hidden" as const,
    ...elevation.card,
  };

  const row = {
    flexDirection: "row" as const,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
  };

  const content = (
    <View style={row}>
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
            // A screen reader should hear "Properties, tab, 2 of 4, selected",
            // not an unlabelled button.
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            accessibilityHint={focused ? undefined : `Opens ${label}`}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48 }}
          >
            {/* Bug report 17: the active pill's 13pt side padding plus the
                heavier 700 weight left "Properties" wider than the cell, so it
                wrapped to "Propertie / s". The pill now spans the whole cell
                and pads by 5, and the label is pinned to one line — shrinking
                slightly rather than wrapping or truncating at large font
                scales. (adjustsFontSizeToFit is native-only; numberOfLines is
                what keeps the web build on one line.) */}
            <View
              style={{
                alignSelf: "stretch",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: space.xs,
                paddingHorizontal: space.xxs,
                borderRadius: space.sm,
                backgroundColor: focused ? colors.brandSoft : "transparent",
                transform: [{ translateY: focused ? -2 : 0 }],
                ...(focused ? elevation.low : null),
              }}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{
                  color,
                  fontSize: T.caption.fontSize + 1,
                  fontWeight: focused ? "700" : "600",
                  marginTop: 3,
                  textAlign: "center",
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

  if (!GLASS) {
    return <View style={[frame, { backgroundColor: colors.surface }]}>{content}</View>;
  }

  return (
    <View style={frame}>
      <BlurView
        intensity={dark ? 40 : 28}
        tint={dark ? "dark" : "light"}
        // The blur alone is too transparent to read against a photo, so a thin
        // wash of the surface colour sits on top of it — the standard recipe
        // for legible glass. It keeps the frosted depth and the contrast.
        style={{ backgroundColor: dark ? "rgba(24,26,33,0.62)" : "rgba(255,255,255,0.72)" }}
      >
        {content}
      </BlurView>
    </View>
  );
}
