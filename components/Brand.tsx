import { View, Text, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, space } from "@/lib/theme";
import { elevation } from "./ui";

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

/** Jamindar's face — the namaste mascot in a white circle with a gold ring.
 *  Use wherever Jamindar appears as a character (login, verify, assistant
 *  intro, chat header), as opposed to Brandmark, which is the app's JAMIN logo.
 *
 *  Golden-ratio (φ) grounded: sizes are meant to be passed from the `space`
 *  scale (e.g. 55/89, or sums like 89+21). With `halo`, the glow diameter is
 *  size + space.lg, keeping the whole treatment on the same harmonic rhythm. */
export function JamindarFace({
  size = 72,
  ring = true,
  halo = false,
}: {
  size?: number;
  ring?: boolean;
  halo?: boolean;
}) {
  const border = ring ? Math.max(1.5, Math.round(size * 0.035)) : 0;
  const face = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#FFFFFF",
        overflow: "hidden",
        borderWidth: border,
        borderColor: colors.goldLight,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={require("../assets/namaste.jpg")}
        style={{ width: size, height: size, resizeMode: "contain" }}
      />
    </View>
  );
  if (!halo) return face;
  const h = size + space.lg; // φ-scaled glow — one Fibonacci step beyond the face
  return (
    <View style={{ width: h, height: h, alignItems: "center", justifyContent: "center" }}>
      <LinearGradient
        colors={[colors.brandSoft, colors.goldSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", width: h, height: h, borderRadius: h / 2, opacity: 0.9 }}
      />
      <View style={{ borderRadius: size / 2, backgroundColor: "#FFFFFF", ...elevation.card }}>
        {face}
      </View>
    </View>
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
