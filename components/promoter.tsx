import { ReactNode } from "react";
import { View, Text, Pressable, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, space, type as T } from "@/lib/theme";
import { Card, elevation } from "./ui";
import { IconChip } from "./premium";

/**
 * Promoter Module — reusable premium building blocks.
 *
 * Everything here is golden-ratio grounded (sizes/margins/radii come from the
 * `space`/`type` scales in lib/theme) and composes the existing design system
 * (Card, IconChip, elevation). Built modular so future promoter screens
 * (Project Explorer, Earnings, Lead Capture, the ML earning tree) reuse the
 * same vocabulary without a redesign.
 */

type PartnerStatus = "none" | "eligible" | "pending" | "verified" | "rejected";

/** "Verified Jamin Bazaar Partner" pill (gold jewel accent) + its pending/none states. */
export function PartnerBadge({ status }: { status: string }) {
  const map: Record<PartnerStatus, { label: string; bg: string; fg: string; icon: string }> = {
    verified: { label: "Verified Jamin Bazaar Partner", bg: colors.goldSoft, fg: colors.goldDark, icon: "ribbon" },
    pending: { label: "Verification pending", bg: colors.brandSoft, fg: colors.brand, icon: "time" },
    eligible: { label: "Verification pending", bg: colors.brandSoft, fg: colors.brand, icon: "time" },
    rejected: { label: "Verification needs attention", bg: colors.brandSoft, fg: colors.brand, icon: "alert-circle" },
    none: { label: "Not yet a partner", bg: colors.surfaceSunken, fg: colors.inkSoft, icon: "person-add" },
  };
  const m = map[(status as PartnerStatus)] ?? map.none;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        backgroundColor: m.bg,
        paddingHorizontal: space.sm,
        paddingVertical: 5,
        borderRadius: 999,
      }}
    >
      <Ionicons name={m.icon as any} size={13} color={m.fg} />
      <Text style={{ color: m.fg, fontWeight: "800", fontSize: T.caption.fontSize + 1, letterSpacing: 0.3 }}>
        {m.label}
      </Text>
    </View>
  );
}

/** Status-driven strip guiding the promoter to verification. Null when verified. */
export function VerificationBanner({ status, onAction }: { status: string; onAction?: () => void }) {
  if (status === "verified") return null;
  const pending = status === "pending" || status === "eligible";
  const cfg = pending
    ? { icon: "time", title: "Verification in progress", body: "Your KYC is under review. You'll get a Verified Jamin Bazaar Partner badge once approved.", cta: null }
    : status === "rejected"
      ? { icon: "alert-circle", title: "Verification needs attention", body: "Some details need correcting. Update your KYC to continue.", cta: "Review KYC" }
      : { icon: "shield-checkmark", title: "Become a Verified Jamin Bazaar Partner", body: "Complete your KYC to unlock referrals, leads, and commissions.", cta: "Complete KYC" };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        backgroundColor: pending ? colors.goldSoft : colors.brandSoft,
        borderRadius: space.md,
        padding: space.sm + 2,
      }}
    >
      <IconChip icon={cfg.icon} size={40} bg={pending ? "#FFFFFF" : colors.surface} fg={pending ? colors.goldDark : colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "800", fontSize: T.small.fontSize + 1, color: pending ? colors.goldDark : colors.brand }}>
          {cfg.title}
        </Text>
        <Text style={{ color: colors.inkSoft, fontSize: T.caption.fontSize + 1, lineHeight: T.small.lineHeight, marginTop: 2 }}>
          {cfg.body}
        </Text>
      </View>
      {cfg.cta ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 7 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: T.caption.fontSize + 1 }}>{cfg.cta}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Golden-ratio metric tile (icon chip · big value · label). Optional tap. */
export function KpiTile({
  icon,
  label,
  value,
  accent = colors.brand,
  tint = colors.brandSoft,
  onPress,
}: {
  icon: string;
  label: string;
  value: string | number;
  accent?: string;
  tint?: string;
  onPress?: () => void;
}) {
  const body = (
    <Card style={{ flex: 1, minWidth: 0, padding: space.sm }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={19} color={accent} />
      </View>
      <Text style={{ fontSize: T.subhead.fontSize, lineHeight: T.subhead.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.xs }}>
        {value}
      </Text>
      <Text style={{ fontSize: T.caption.fontSize + 1, color: colors.inkFaint, marginTop: 1 }} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress}>
      {body}
    </Pressable>
  );
}

/** Square quick-action shortcut (tinted icon + label). ~3 per row. */
export function ShortcutTile({
  icon,
  label,
  onPress,
  tint = colors.brandSoft,
  accent = colors.brand,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  tint?: string;
  accent?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: "31%",
        backgroundColor: colors.surface,
        borderRadius: space.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        paddingVertical: space.sm,
        gap: 7,
        ...elevation.low,
      }}
    >
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={22} color={accent} />
      </View>
      <Text style={{ fontSize: T.caption.fontSize + 1, fontWeight: "600", color: colors.inkSoft, textAlign: "center" }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Dark navy earnings summary (total in gold, pending/paid columns). */
export function EarningsCard({
  total,
  pending,
  paid,
  caption,
}: {
  total: string;
  pending: string;
  paid: string;
  caption?: string;
}) {
  return (
    <View style={{ backgroundColor: colors.navy, borderRadius: 18, padding: space.md, ...elevation.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Ionicons name="wallet" size={16} color={colors.goldLight} />
        <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
          Earnings summary
        </Text>
      </View>
      <Text style={{ color: "#fff", fontSize: T.hero.fontSize, lineHeight: T.hero.lineHeight, fontWeight: "800", marginTop: space.xs, letterSpacing: -0.5 }}>
        {total}
      </Text>
      <View style={{ flexDirection: "row", marginTop: space.sm, gap: space.sm }}>
        <View style={{ flex: 1, backgroundColor: colors.navySoft, borderRadius: 12, padding: space.sm }}>
          <Text style={{ color: colors.goldLight, fontSize: T.body.fontSize, fontWeight: "800" }}>{pending}</Text>
          <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>Pending</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.navySoft, borderRadius: 12, padding: space.sm }}>
          <Text style={{ color: "#fff", fontSize: T.body.fontSize, fontWeight: "800" }}>{paid}</Text>
          <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>Paid</Text>
        </View>
      </View>
      {caption ? (
        <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: space.sm }}>{caption}</Text>
      ) : null}
    </View>
  );
}

/** Elegant dashed "reserved for a future module" card — honest roadmap made
 *  visible (Earning Tree / Lead Capture / Project Explorer, etc.). */
export function ReservedCard({
  icon = "sparkles",
  title,
  subtitle,
  tag = "Coming soon",
}: {
  icon?: string;
  title: string;
  subtitle: string;
  tag?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        borderRadius: space.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderStyle: "dashed",
        backgroundColor: colors.surface,
        padding: space.sm + 2,
      }}
    >
      <IconChip icon={icon} size={42} bg={colors.goldSoft} fg={colors.goldDark} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "800", fontSize: T.small.fontSize + 1, color: colors.ink }}>{title}</Text>
        <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, lineHeight: T.small.lineHeight, marginTop: 1 }}>
          {subtitle}
        </Text>
      </View>
      <View style={{ backgroundColor: colors.goldSoft, borderRadius: 999, paddingHorizontal: space.xs + 2, paddingVertical: 4 }}>
        <Text style={{ color: colors.goldDark, fontSize: T.caption.fontSize, fontWeight: "800", letterSpacing: 0.3 }}>{tag}</Text>
      </View>
    </View>
  );
}

/** Section title + optional "See all" trailing action (φ spacing). */
export function PromoterSection({
  title,
  actionLabel,
  onAction,
  children,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ marginTop: space.lg }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm }}>
        <Text style={{ fontSize: T.subhead.fontSize - 2, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 }}>{title}</Text>
        {onAction && actionLabel ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Compact empty-state used inside sections (keeps the dashboard calm). */
export function SoftEmpty({ icon = "sparkles-outline", text }: { icon?: string; text: string }) {
  return (
    <View style={{ alignItems: "center", gap: 7, backgroundColor: colors.surface, borderRadius: space.md, borderWidth: 1, borderColor: colors.border, paddingVertical: space.lg }}>
      <Ionicons name={icon as any} size={24} color={colors.inkFaint} />
      <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, textAlign: "center", paddingHorizontal: space.md }}>{text}</Text>
    </View>
  );
}
