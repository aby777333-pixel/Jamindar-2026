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
          borderRadius: 23,
          backgroundColor: colors.brand,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.body.fontSize }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, fontWeight: "600" }}>
          {greeting} 🙏
        </Text>
        <Text numberOfLines={1} style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>
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
          backgroundColor: colors.brand,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.brand,
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        }}
      >
        <Ionicons name="options" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

/** Glossy red gradient hero with headline + Get Started pill + photo. */
export function LandHero({
  title = "Find Your\nPerfect Land",
  subtitle = "Buy, sell & rent verified\nplots with confidence.",
  cta = "Get Started",
  image,
  onPress,
}: {
  title?: string;
  subtitle?: string;
  cta?: string;
  image?: string;
  onPress?: () => void;
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        overflow: "hidden",
        shadowColor: colors.brand,
        shadowOpacity: 0.3,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      }}
    >
      <LinearGradient
        colors={["#F0474E", "#E11B22", "#A5141A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flexDirection: "row" }}
      >
        <View style={{ flex: 1.35, paddingVertical: space.md, paddingLeft: space.md, paddingRight: space.xs }}>
          <Text style={{ color: "#fff", fontSize: T.title.fontSize - 3, lineHeight: T.title.lineHeight - 4, fontWeight: "800", letterSpacing: -0.4 }}>
            {title}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: T.small.fontSize - 1, marginTop: space.xs, lineHeight: 17 }}>
            {subtitle}
          </Text>
          <Pressable
            onPress={onPress}
            style={{
              alignSelf: "flex-start",
              marginTop: space.sm,
              backgroundColor: "#fff",
              borderRadius: 999,
              paddingHorizontal: 18,
              paddingVertical: 10,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 3,
            }}
          >
            <Text style={{ color: colors.brand, fontWeight: "800", fontSize: T.small.fontSize }}>{cta}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: "100%", height: "100%", borderTopLeftRadius: 40 }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderTopLeftRadius: 40 }} />
          )}
        </View>
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
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        ...elevation.card,
        transform: [{ translateY: pressed ? 1 : 0 }],
      })}
    >
      <View style={{ height: 118 }}>
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
              backgroundColor: "rgba(20,160,90,0.95)",
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Ionicons name="checkmark-circle" size={11} color="#fff" />
            <Text style={{ color: "#fff", fontSize: T.caption.fontSize, fontWeight: "700" }}>{tag}</Text>
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
      <View style={{ padding: 12 }}>
        <Text numberOfLines={1} style={{ fontWeight: "800", fontSize: T.small.fontSize + 1, color: colors.ink }}>
          {property.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>
          {loc}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 7 }}>
          <Text style={{ color: colors.brand, fontWeight: "800", fontSize: T.body.fontSize }}>
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
      <Text style={{ fontWeight: "800", fontSize: T.subhead.fontSize - 2, color: colors.ink }}>{title}</Text>
      {onAction ? (
        <Pressable onPress={onAction}>
          <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>{actionLabel}</Text>
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
