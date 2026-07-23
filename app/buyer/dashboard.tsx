import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import { KYC_STATUS_META } from "@/lib/types";

type Item = { label: string; icon: string; href: Href; tint?: string };

const ITEMS: Item[] = [
  { label: "Home", icon: "home", href: "/(tabs)/home" as Href },
  { label: "Properties", icon: "business", href: "/(tabs)/properties" as Href },
  { label: "My Interests", icon: "heart-circle", href: "/interests" as Href },
  { label: "Saved", icon: "bookmark", href: "/saved" as Href },
  { label: "Nearby", icon: "navigate", href: "/(tabs)/properties" as Href },
  { label: "Site Visits", icon: "calendar", href: "/visits" as Href },
  { label: "Documents", icon: "folder-open", href: "/buyer/kyc" as Href },
  { label: "Referral", icon: "gift", href: "/referral" as Href },
  { label: "Notifications", icon: "notifications", href: "/notifications" as Href },
  { label: "Messages", icon: "chatbubbles", href: "/(tabs)/assistant" as Href },
  { label: "Support", icon: "help-buoy", href: "/support" as Href },
  { label: "Profile", icon: "person", href: "/profile" as Href },
];

export default function BuyerDashboard() {
  const router = useRouter();
  const { profile } = useAuth();
  const kyc = KYC_STATUS_META[profile?.kyc_status ?? "not_started"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* identity strip */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.navy, borderRadius: 20, padding: 16, marginBottom: space.md }}>
          <View style={{ width: 50, height: 50, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>{initials(profile?.full_name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }} numberOfLines={1}>{profile?.full_name ?? "Guest"}</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
              {[profile?.member_code, kyc.label].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {profile?.partner_status === "verified" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(224,164,35,0.18)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
              <Ionicons name="ribbon" size={13} color={colors.gold} />
              <Text style={{ color: colors.gold, fontSize: 11, fontWeight: "700" }}>Partner</Text>
            </View>
          ) : null}
        </View>

        {/* grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {ITEMS.map((it) => (
            <Pressable key={it.label} onPress={() => router.push(it.href)} style={{ width: "30.5%", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 18 }}>
              <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name={it.icon as any} size={22} color={colors.brand} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.ink }} numberOfLines={1}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
