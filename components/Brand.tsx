import { View, Text } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { colors } from "@/lib/theme";

/** The JAMIN mark — red rounded square with the white infinity/DNA loop. */
export function Brandmark({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="4" y="4" width="92" height="92" rx="16" fill={colors.brand} />
      {/* gold folded corner */}
      <Path d="M70 4 H96 V30 Z" fill={colors.goldLight} />
      {/* infinity loop */}
      <Path
        d="M28 38 C22 38 18 44 18 50 C18 56 22 62 28 62 C36 62 42 50 50 50 C58 50 64 62 72 62 C78 62 82 56 82 50 C82 44 78 38 72 38 C64 38 58 50 50 50 C42 50 36 38 28 38 Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Circle cx="50" cy="50" r="4" fill={colors.goldLight} />
    </Svg>
  );
}

/** Full wordmark: red JAMIN, black JAMINDAR/PROPERTIES, gold tagline. */
export function Wordmark({
  size = "md",
  tagline = true,
}: {
  size?: "sm" | "md" | "lg";
  tagline?: boolean;
}) {
  const brandSize = size === "lg" ? 30 : size === "md" ? 24 : 18;
  const subSize = size === "lg" ? 22 : size === "md" ? 18 : 14;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={{ color: colors.brand, fontWeight: "800", fontSize: brandSize, letterSpacing: 2 }}>
          JAMIN
        </Text>
        <Text style={{ color: colors.ink, fontWeight: "800", fontSize: subSize, letterSpacing: 3, marginLeft: 4 }}>
          PROPERTIES
        </Text>
      </View>
      {tagline && (
        <Text style={{ color: colors.gold, fontSize: 10, letterSpacing: 3, marginTop: 2, fontStyle: "italic" }}>
          signature for Fortune
        </Text>
      )}
    </View>
  );
}

/** Logo lockup: mark + wordmark in a row (used in headers). */
export function LogoLockup() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Brandmark size={40} />
      <Wordmark size="sm" tagline={false} />
    </View>
  );
}
