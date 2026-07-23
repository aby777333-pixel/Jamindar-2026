import { ReactNode } from "react";
import { View, Text, Pressable, Image, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, space, type as T } from "@/lib/theme";
import { elevation } from "./ui";
import { formatINR, formatArea } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

/** "Good Morning, {name}" greeting header with avatar + notification bell. */
export function GreetingHeader({
  name,
  initials,
  greeting = "Good Morning",
  onBell,
  hasAlert,
}: {
  name: string;
  initials: string;
  greeting?: string;
  onBell?: () => void;
  hasAlert?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 15,
          backgroundColor: colors.brand,
          alignItems: "center",
          justifyContent: "center",
          ...elevation.low,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: T.small.fontSize + 1 }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, fontWeight: "400" }}>
          {greeting} 🙏
        </Text>
        <Text numberOfLines={1} style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.5 }}>
          {name}
        </Text>
      </View>
      <Pressable
        onPress={onBell}
        style={{
          width: 46,
          height: 46,
          borderRadius: 15,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          ...elevation.low,
        }}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.inkSoft} />
        {hasAlert ? (
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 13,
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: colors.brand,
              borderWidth: 1.5,
              borderColor: colors.surface,
            }}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

/** Search box + red filter button. Read-only pill by default (routes on tap). */
export function SearchRow({
  value,
  placeholder = "Search plots, cities…",
  onChangeText,
  onPress,
  onFilter,
  editable = false,
}: {
  value?: string;
  placeholder?: string;
  onChangeText?: (t: string) => void;
  onPress?: () => void;
  onFilter?: () => void;
  editable?: boolean;
}) {
  const box = (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        backgroundColor: colors.surface,
        borderRadius: 16,
        height: 50,
        paddingHorizontal: 14,
        ...elevation.low,
      }}
    >
      <Ionicons name="search" size={20} color={colors.inkFaint} />
      {editable ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          style={{ flex: 1, fontSize: T.small.fontSize, color: colors.ink }}
        />
      ) : (
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize }}>{value || placeholder}</Text>
      )}
    </View>
  );
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {editable ? box : <Pressable style={{ flex: 1 }} onPress={onPress}>{box}</Pressable>}
      <Pressable
        onPress={onFilter}
        style={{
          width: 50,
          height: 50,
          borderRadius: 15,
          backgroundColor: colors.ink,
          alignItems: "center",
          justifyContent: "center",
          ...elevation.low,
        }}
      >
        <Ionicons name="options" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

/** Premium navy + gold hero. Kicker · headline (gold accent word) · red CTA. */
export function LandHero({
  kicker = "✦ Your AI advisor",
  title = "Meet Jamindar",
  accentWord = "Jamindar",
  subtitle = "Ask about any plot — in your own\nlanguage, by voice.",
  cta = "Talk to Jamindar",
  ctaIcon = "mic",
  onPress,
}: {
  kicker?: string;
  title?: string;
  accentWord?: string;
  subtitle?: string;
  cta?: string;
  ctaIcon?: keyof typeof Ionicons.glyphMap;
  image?: string;
  onPress?: () => void;
}) {
  // Split the title so the accent word renders in gold (premium jewel accent).
  const idx = accentWord ? title.indexOf(accentWord) : -1;
  const before = idx >= 0 ? title.slice(0, idx) : title;
  const accent = idx >= 0 ? accentWord : "";
  const after = idx >= 0 ? title.slice(idx + accentWord.length) : "";

  return (
    <View
      style={{
        borderRadius: 24,
        overflow: "hidden",
        shadowColor: colors.navy,
        shadowOpacity: 0.4,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 7,
      }}
    >
      <LinearGradient
        colors={["#212B47", colors.navy, "#0E1322"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: space.md, paddingBottom: space.md + 2, position: "relative" }}
      >
        {/* soft gold glow, top-right */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -60,
            top: -70,
            width: 190,
            height: 190,
            borderRadius: 95,
            backgroundColor: "rgba(224,164,35,0.16)",
          }}
        />
        <View
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.07)",
            borderWidth: 1,
            borderColor: "rgba(224,164,35,0.22)",
            borderRadius: 999,
            paddingHorizontal: 11,
            paddingVertical: 5,
          }}
        >
          <Text style={{ color: colors.gold, fontSize: T.caption.fontSize + 1, fontWeight: "500", letterSpacing: 0.6 }}>
            {kicker}
          </Text>
        </View>
        <Text style={{ marginTop: space.sm, fontSize: T.subhead.fontSize + 3, lineHeight: T.subhead.lineHeight + 3, fontWeight: "600", letterSpacing: -0.6, color: "#fff", maxWidth: 220 }}>
          {before}
          <Text style={{ color: colors.gold }}>{accent}</Text>
          {after}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: T.small.fontSize, marginTop: 4, lineHeight: 18, maxWidth: 210 }}>
          {subtitle}
        </Text>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            marginTop: space.md,
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            backgroundColor: colors.brand,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 11,
            shadowColor: colors.brand,
            shadowOpacity: pressed ? 0 : 0.5,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: pressed ? 1 : 6,
            transform: [{ translateY: pressed ? 1 : 0 }],
          })}
        >
          <Ionicons name={ctaIcon} size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "500", fontSize: T.small.fontSize + 1 }}>{cta}</Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

/** Emoji quick-action tile (Ongoing / Current / Future). */
export function QuickActionTile({
  emoji,
  label,
  tint,
  onPress,
}: {
  emoji: string;
  label: string;
  tint: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 20,
        paddingVertical: 16,
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        ...elevation.low,
        transform: [{ translateY: pressed ? 1 : 0 }],
      })}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: tint,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 9,
        }}
      >
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: T.small.fontSize, fontWeight: "700", color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Emoji land-type circle tile. */
export function LandTypeTile({ emoji, label, onPress }: { emoji: string; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 78, alignItems: "center" }}>
      <View
        style={{
          width: 62,
          height: 62,
          borderRadius: 31,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
          ...elevation.low,
        }}
      >
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: T.caption.fontSize + 1, fontWeight: "600", color: colors.inkSoft, textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Returns the top approval label (DTCP/RERA/…) that is true, if any. */
export function topApproval(approvals: Record<string, boolean> | null | undefined): string | null {
  if (!approvals) return null;
  const order = ["dtcp", "rera", "cmda", "panchayat", "clear_title"];
  const labels: Record<string, string> = {
    dtcp: "DTCP",
    rera: "RERA",
    cmda: "CMDA",
    panchayat: "Panchayat",
    clear_title: "Clear Title",
  };
  for (const k of order) if (approvals[k]) return labels[k];
  const first = Object.keys(approvals).find((k) => approvals[k]);
  return first ? labels[first] ?? first.toUpperCase() : null;
}

/** Verified listing card (photo + heart + ✓approval tag + Map View + ₹ price). */
export function VerifiedListingCard({
  property,
  width = 210,
  saved,
  onSave,
  onMap,
  onPress,
}: {
  property: Property;
  width?: number;
  saved?: boolean;
  onSave?: () => void;
  onMap?: () => void;
  onPress?: () => void;
}) {
  const tag = topApproval(property.approvals);
  const loc = [property.locality, property.city].filter(Boolean).join(", ") || PROPERTY_TYPE_LABELS[property.property_type];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        backgroundColor: colors.surface,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        ...elevation.card,
        transform: [{ translateY: pressed ? 1 : 0 }],
      })}
    >
      <View style={{ height: 122 }}>
        {property.images?.[0] ? (
          <Image source={{ uri: property.images[0] }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="image" size={28} color={colors.inkFaint} />
          </View>
        )}
        <Pressable
          onPress={onSave}
          hitSlop={8}
          style={{
            position: "absolute",
            top: 9,
            left: 9,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.92)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={saved ? "heart" : "heart-outline"} size={16} color={colors.brand} />
        </Pressable>
        {tag ? (
          <View
            style={{
              position: "absolute",
              top: 9,
              right: 9,
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              backgroundColor: "rgba(255,255,255,0.94)",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Ionicons name="checkmark-circle" size={11} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: T.caption.fontSize, fontWeight: "600" }}>{tag}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={onMap}
          style={{
            position: "absolute",
            bottom: 9,
            left: 9,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: "rgba(255,255,255,0.92)",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <Ionicons name="location" size={11} color={colors.brand} />
          <Text style={{ color: colors.ink, fontSize: T.caption.fontSize, fontWeight: "700" }}>Map View</Text>
        </Pressable>
      </View>
      <View style={{ padding: 13 }}>
        <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: T.small.fontSize + 1, color: colors.ink, letterSpacing: -0.3 }}>
          {property.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 2 }}>
          {loc}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.surfaceSunken }}>
          <Text style={{ color: colors.ink, fontWeight: "600", fontSize: T.body.fontSize, letterSpacing: -0.4 }}>
            {property.price != null ? formatINR(property.price) : "On request"}
          </Text>
          {property.area_value ? (
            <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
              {formatArea(property.area_value, property.area_unit)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Section header row with an optional "See all" trailing link. */
export function RowHeader({ title, actionLabel = "See all", onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ fontWeight: "600", fontSize: T.subhead.fontSize - 2, color: colors.ink, letterSpacing: -0.4 }}>{title}</Text>
      {onAction ? (
        <Pressable onPress={onAction}>
          <Text style={{ color: colors.brand, fontWeight: "500", fontSize: T.small.fontSize }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export type LandTypeDef = { emoji: string; label: string; type: Property["property_type"] };
export const LAND_TYPES: LandTypeDef[] = [
  { emoji: "🌾", label: "Agricultural", type: "farm_land" },
  { emoji: "🏘️", label: "Residential", type: "residential_plot" },
  { emoji: "🏡", label: "Villa Plots", type: "villa_plot" },
  { emoji: "🏢", label: "Commercial", type: "commercial_land" },
  { emoji: "🏭", label: "Industrial", type: "industrial_land" },
];

export type PhaseDef = { emoji: string; label: string; tint: string; phase: "ongoing" | "current" | "future" };
export const PROJECT_PHASES: PhaseDef[] = [
  { emoji: "🏗️", label: "Ongoing", tint: colors.goldSoft, phase: "ongoing" },
  { emoji: "🏡", label: "Current", tint: colors.brandSoft, phase: "current" },
  { emoji: "🌱", label: "Future", tint: colors.successSoft, phase: "future" },
];
