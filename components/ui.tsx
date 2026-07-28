import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  ViewStyle,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colors, space, type as T } from "@/lib/theme";

// Reusable soft, refined elevation (elegant layered shadow + Android elevation).
export const elevation = {
  low: {
    shadowColor: "#1B1B4B",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  card: {
    shadowColor: "#1B1B4B",
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

export function Screen({
  children,
  scroll = true,
  edges = ["top", "bottom"],
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: ViewStyle;
}) {
  const inner = (
    <View style={[{ flex: 1, paddingHorizontal: 20 }, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={edges}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const base = {
    backgroundColor: colors.surface,
    borderRadius: space.md,
    padding: space.sm + 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: "#FFFFFF",
  };
  if (onPress) {
    // When pressable, the Pressable — not the inner View — is the flex child
    // of the caller's row/column, so layout props must sit on IT. Leaving them
    // on the inner View made `flex: 1` Cards hug their content (uneven pairs
    // like Admin Console / Ask Jamindar on Home).
    const {
      flex, alignSelf, width, minWidth, maxWidth,
      margin, marginTop, marginBottom, marginLeft, marginRight,
      ...visual
    } = (style ?? {}) as ViewStyle;
    return (
      <Pressable
        onPress={onPress}
        // Plain object, NOT a function: NativeWind's jsxImportSource interop
        // drops function-form Pressable styles on native (web is unaffected).
        style={{
          flex, alignSelf, width, minWidth, maxWidth,
          margin, marginTop, marginBottom, marginLeft, marginRight,
        }}
      >
        <View style={[base, elevation.card, visual]}>{children}</View>
      </Pressable>
    );
  }
  return <View style={[base, elevation.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  compact,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "gold" | "outline";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Tight rows (e.g. the property action bar): slimmer side padding so the
   *  label never truncates when the button shares a row with icons. */
  compact?: boolean;
}) {
  const bg = variant === "gold" ? colors.gold : colors.brand;
  const fg = variant === "ghost" || variant === "outline" ? colors.brand : "#fff";
  const solid = variant === "primary" || variant === "gold";
  // glossy 3-stop gradient (light sheen → base → deep) for a premium finish
  const gloss: [string, string, string] =
    variant === "gold" ? ["#E8C766", "#C9A227", "#9C7D1A"] : ["#F0474E", "#E11B22", "#B8151B"];
  const radius = space.sm + 3;

  // The label sits INSIDE the coloured surface, so the surface must carry the
  // horizontal padding. Without it a caller's paddingHorizontal lands on the
  // outer Pressable — outside the pill — and the pill hugs its text.
  const surface = {
    borderRadius: radius,
    paddingVertical: space.sm + 2,
    paddingHorizontal: compact ? space.sm : space.lg,
    minHeight: 52,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <Text
      numberOfLines={1}
      // native-only safety net; web relies on the compact font size below
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      style={{
        color: fg,
        fontWeight: "700",
        fontSize: compact ? T.small.fontSize + 1 : T.body.fontSize,
        letterSpacing: compact ? 0.1 : 0.3,
        textAlign: "center",
      }}
    >
      {label}
    </Text>
  );

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={[
        {
          borderRadius: radius,
          opacity: disabled ? 0.5 : 1,
          shadowColor: solid ? bg : "#000",
          shadowOpacity: solid ? 0.3 : 0,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 7 },
          elevation: solid ? 7 : 0,
        },
        style,
      ]}
    >
      {solid ? (
        <LinearGradient
          colors={gloss}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            ...surface,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.35)",
          }}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={{
            ...surface,
            borderWidth: variant === "outline" ? 1.5 : 0,
            borderColor: colors.brand,
          }}
        >
          {inner}
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? colors.brand : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.border,
      }}
    >
      <Text style={{ color: active ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatCard({
  label,
  value,
  accent = colors.brand,
  onPress,
}: {
  label: string;
  value: string | number;
  accent?: string;
  /** Optional — makes the stat card tappable (e.g. Registration Details). */
  onPress?: () => void;
}) {
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 0, padding: space.sm }}>
      <Text style={{ color: accent, fontSize: T.subhead.fontSize, lineHeight: T.subhead.lineHeight, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 2, marginTop: 2 }}>{label}</Text>
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
      <ActivityIndicator color={colors.brand} size="large" />
      {label ? <Text style={{ color: colors.inkFaint, marginTop: 12 }}>{label}</Text> : null}
    </View>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xl, paddingHorizontal: space.lg }}>
      <Text style={{ fontSize: T.body.fontSize, fontWeight: "700", color: colors.ink }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, textAlign: "center", marginTop: space.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: T.subhead.fontSize, lineHeight: T.subhead.lineHeight, fontWeight: "800", color: colors.ink, marginBottom: space.sm }}>
      {children}
    </Text>
  );
}
