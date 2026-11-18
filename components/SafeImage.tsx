import { useEffect, useState } from "react";
import { Image, View, type ImageStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { IMG } from "@/lib/img";
import { colors } from "@/lib/theme";

/**
 * A property photo that cannot end up as a black rectangle.
 *
 * Listings ask Supabase's image CDN for a resized copy (`IMG.hero` etc.). When
 * that transform fails — rate-limited, a cold edge, a file it cannot decode —
 * a plain <Image> just stays blank and the card or hero shows a black box
 * (report 2026-11 #6: "plot images become invisible and show a black screen").
 *
 * Stage 0 asks for the resized copy, stage 1 retries with the original file,
 * stage 2 shows a neutral placeholder instead of nothing.
 */
export function SafeImage({
  uri,
  variant,
  style,
  resizeMode = "cover",
}: {
  uri?: string | null;
  variant: keyof typeof IMG;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  useEffect(() => setStage(0), [uri]);

  if (!uri || stage === 2) {
    return (
      <View style={[{ backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }, style as any]}>
        <Ionicons name="image-outline" size={28} color={colors.inkFaint} />
      </View>
    );
  }
  const src = stage === 0 ? IMG[variant](uri) : uri;
  return (
    <Image
      source={{ uri: src }}
      style={[{ backgroundColor: colors.surfaceSunken }, style]}
      resizeMode={resizeMode}
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
    />
  );
}
