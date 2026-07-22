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
import { colors } from "@/lib/theme";

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
  const body = (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: 20,
          padding: 16,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
        {body}
      </Pressable>
    );
  return body;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "gold" | "outline";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    variant === "primary"
      ? colors.brand
      : variant === "gold"
      ? colors.gold
      : "transparent";
  const fg = variant === "ghost" || variant === "outline" ? colors.brand : "#fff";
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor: colors.brand,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontWeight: "700", fontSize: 16 }}>{label}</Text>
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
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 0, padding: 14 }}>
      <Text style={{ color: accent, fontSize: 24, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }}>{label}</Text>
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
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: colors.inkFaint, textAlign: "center", marginTop: 6 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>
      {children}
    </Text>
  );
}
