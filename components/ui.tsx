import { ReactNode, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  ViewStyle,
  ScrollView,
} from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, space, type as T } from "@/lib/theme";
import { AnimatedPressable, usePressScale } from "@/lib/motion";

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
  avoidKeyboard = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  style?: ViewStyle;
  /**
   * Lift the content clear of the on-screen keyboard and keep the focused
   * field visible (bug report 17: the keyboard covered City/State on
   * "Complete your profile").
   *
   * The manifest already sets `adjustResize`, but the app runs edge-to-edge,
   * where Android no longer resizes the window — so a KeyboardAvoidingView is
   * what actually shortens the scroll view and lets it scroll the focused
   * input into view.
   *
   * ⚠️ Opt-in on purpose. `Screen` is shared by login, signup, verify, role and
   * desk-contact, and wrapping all of them unasked is how a keyboard fix turns
   * into five layout regressions. Turn it on per screen.
   */
  avoidKeyboard?: boolean;
}) {
  const inner = (
    <View style={[{ flex: 1, paddingHorizontal: 20 }, style]}>{children}</View>
  );
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      // iOS can do this natively; Android relies on the wrapper below.
      automaticallyAdjustKeyboardInsets={avoidKeyboard && Platform.OS === "ios"}
    >
      {inner}
    </ScrollView>
  ) : (
    inner
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={edges}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
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
  const press = usePressScale();
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
      // Owner directive 05-08 — "micro animations". The ripple below is
      // Android-only, so iOS and web tapped a card and got no acknowledgement
      // at all. The spring press-scale gives every platform the same small
      // depression, and stands down when the OS asks for reduced motion.
      <AnimatedPressable
        onPress={onPress}
        {...press.handlers}
        accessibilityRole="button"
        // Soft native ripple = premium touch feedback without function-form
        // styles (which NativeWind drops on native — keep plain objects only).
        android_ripple={{ color: "rgba(20,21,26,0.07)", foreground: true }}
        style={[
          {
            flex, alignSelf, width, minWidth, maxWidth,
            margin, marginTop, marginBottom, marginLeft, marginRight,
            borderRadius: space.md,
          },
          press.style,
        ]}
      >
        <View style={[base, elevation.card, visual]}>{children}</View>
      </AnimatedPressable>
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
  const press = usePressScale();
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
    <AnimatedPressable
      disabled={disabled || loading}
      {...press.handlers}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
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
        press.style,
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
    </AnimatedPressable>
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
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={4}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? colors.brand : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.border,
        shadowColor: active ? colors.brand : "transparent",
        shadowOpacity: active ? 0.35 : 0,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: active ? 3 : 0,
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
      <View style={{ width: 26, height: 3, borderRadius: 99, backgroundColor: accent, opacity: 0.85, marginBottom: 6 }} />
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

/**
 * A single shimmering placeholder block.
 *
 * A spinner says "wait"; a skeleton says "this is what is arriving", which is
 * most of the difference between an app that feels slow and one that feels
 * considered. The pulse is driven on the UI thread by Reanimated, so it keeps
 * moving even while the JS thread is busy parsing the response.
 */
export function Skeleton({
  width = "100%", height = 14, radius = 8, style,
}: { width?: number | string; height?: number; radius?: number; style?: any }) {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
    // Reanimated cancels the loop when the node unmounts; nothing to clean up.
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Reanimated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: colors.surfaceSunken },
        animated,
        style,
      ]}
    />
  );
}

/** Placeholder cards shaped like the list that is loading. */
export function SkeletonList({ rows = 4, height = 96 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: space.sm, padding: space.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row", gap: space.sm, padding: space.sm,
            backgroundColor: colors.surface, borderRadius: 16,
            borderWidth: 1, borderColor: colors.border,
          }}
        >
          <Skeleton width={84} height={height - 24} radius={12} />
          <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
            <Skeleton width="72%" height={13} />
            <Skeleton width="45%" height={11} />
            <Skeleton width="58%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Empty({ title, subtitle, icon = "sparkles-outline" }: { title: string; subtitle?: string; icon?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xl, paddingHorizontal: space.lg }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: space.sm }}>
        <Ionicons name={icon as any} size={26} color={colors.brand} />
      </View>
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
