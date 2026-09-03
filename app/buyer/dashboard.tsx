import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Redirect, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { BecomePromoterBanner, InviteFriendsPrompt } from "@/components/promoter-cta";
import { colors, space, type as T } from "@/lib/theme";
import { initials, formatINR } from "@/lib/format";
import { KYC_STATUS_META } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { ADVANCE_STATUS_LABEL, fetchMyAdvances } from "@/lib/advance";

const ADVANCE_TINT: Record<string, string> = { pending: colors.gold, approved: colors.success, rejected: "#D93025" };

/**
 * Advance payments the buyer has recorded (0096) and where each one stands.
 * Rendered only when there is at least one — a buyer who has never paid an
 * advance should not see an empty "payments" box on their dashboard.
 */
function AdvancePayments({ userId }: { userId: string }) {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ["my-advances", userId],
    queryFn: () => fetchMyAdvances(userId),
  });
  if (!data?.length) return null;
  return (
    <View style={{ marginBottom: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.inkFaint, paddingVertical: 8 }}>
        Your advance payments
      </Text>
      {data.slice(0, 5).map((a, i) => {
        const tint = ADVANCE_TINT[a.status] ?? colors.inkFaint;
        return (
          <Pressable
            key={a.id}
            onPress={() => router.navigate(`/property/${a.property_id}` as Href)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.ink }} numberOfLines={1}>
                {formatINR(Number(a.amount))}{a.plot ? ` · Plot ${a.plot}` : ""}
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 2 }} numberOfLines={1}>
                {a.ref} · Txn {a.transaction_id} · {new Date(a.created_at).toLocaleDateString("en-IN")}
              </Text>
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${tint}1A` }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: tint }}>{ADVANCE_STATUS_LABEL[a.status] ?? a.status}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  // Audit 29-07: this tile opened the AI assistant instead of the inbox.
  { label: "Messages", icon: "chatbubbles", href: "/messages" as Href },
  { label: "Support", icon: "help-buoy", href: "/support" as Href },
  { label: "Profile", icon: "person", href: "/profile" as Href },
];

export default function BuyerDashboard() {
  const router = useRouter();
  const { profile } = useAuth();
  const role = useEffectiveRole();

  // Owner directive 05-08: a promoter is never shown the buyer workspace. The
  // Account menu now sends them to /promoter, so this only catches a deep link
  // or a stale back-stack entry — but it is the guarantee, not the menu.
  if (role === "promoter") return <Redirect href={"/promoter" as Href} />;

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
              {/* super admins show the role, never a generated ID (29-07) */}
              {[profile?.role === "super_admin" ? "Super Admin" : profile?.member_code, kyc.label].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {profile?.partner_status === "verified" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(224,164,35,0.18)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
              <Ionicons name="ribbon" size={13} color={colors.gold} />
              <Text style={{ color: colors.gold, fontSize: 11, fontWeight: "700" }}>Partner</Text>
            </View>
          ) : null}
        </View>

        {/* advance payments and their verification status (0096) */}
        {profile?.id ? <AdvancePayments userId={profile.id} /> : null}

        {/* upgrade to promoter — buyers only */}
        <View style={{ marginBottom: space.md }}>
          <BecomePromoterBanner />
        </View>

        {/* grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {ITEMS.map((it) => (
            <Pressable key={it.label} onPress={() => router.navigate(it.href)} style={{ width: "30.5%", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 18 }}>
              <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name={it.icon as any} size={22} color={colors.brand} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.ink }} numberOfLines={1}>{it.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* invite friends & family */}
        <View style={{ marginTop: space.md }}>
          <InviteFriendsPrompt />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
