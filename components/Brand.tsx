import { View, Text, Image } from "react-native";
import { colors } from "@/lib/theme";

/** The real JAMIN mark (red square + white bow-tie + gold DNA + folded corner). */
export function Brandmark({ size = 44 }: { size?: number }) {
  return (
    <Image
      source={require("../assets/logo-mark.png")}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.08) }}
      resizeMode="contain"
    />
  );
}

/** Full wordmark: red JAMIN, black PROPERTIES, gold tagline. */
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
