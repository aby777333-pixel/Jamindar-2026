import { ReactNode } from "react";
import { View, Text, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, space, type as T } from "@/lib/theme";
import { elevation } from "./ui";

type BadgeTone = "verified" | "premium" | "role" | "new" | "neutral";

const BADGE: Record<BadgeTone, { bg: string; fg: string }> = {
  verified: { bg: colors.successSoft, fg: colors.success },
  premium: { bg: colors.goldSoft, fg: colors.goldDark },
  role: { bg: colors.brandSoft, fg: colors.brand },
  new: { bg: colors.brandSoft, fg: colors.brand },
  neutral: { bg: colors.surfaceSunken, fg: colors.inkSoft },
};

/** Small pill badge — verified (green), premium/elite (gold), role (red), etc. */
export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: string;
}) {
  const c = BADGE[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        backgroundColor: c.bg,
        paddingHorizontal: space.xs + 2,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      {icon ? <Ionicons name={icon as any} size={12} color={c.fg} /> : null}
      <Text style={{ color: c.fg, fontWeight: "700", fontSize: T.caption.fontSize + 1, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

/** Centered section title with a short red underline accent. */
export function SectionHeader({ title, align = "center" }: { title: string; align?: "center" | "left" }) {
  return (
    <View style={{ alignItems: align === "center" ? "center" : "flex-start", marginBottom: space.md }}>
      <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink, letterSpacing: 0.3 }}>
        {title}
      </Text>
      <View style={{ width: 34, height: 3, borderRadius: 2, backgroundColor: colors.brand, marginTop: space.xs - 2 }} />
    </View>
  );
}

/** Dark navy emphasis card (business card, concierge, official links). */
export function DarkCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.navy,
          borderRadius: 18,
          padding: space.md,
          ...elevation.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Soft tinted square icon chip used throughout the premium cards. */
export function IconChip({
  icon,
  bg = colors.brandSoft,
  fg = colors.brand,
  size = 44,
}: {
  icon: string;
  bg?: string;
  fg?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon as any} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

/** A labelled info row (label small/muted, value bold) with optional icon + trailing. */
export function InfoRow({
  icon,
  label,
  value,
  trailing,
}: {
  icon?: string;
  label: string;
  value: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {icon ? <IconChip icon={icon} size={38} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" }}>
          {label}
        </Text>
        <Text style={{ color: colors.ink, fontSize: T.body.fontSize, fontWeight: "700", marginTop: 1 }}>{value}</Text>
      </View>
      {trailing}
    </View>
  );
}
