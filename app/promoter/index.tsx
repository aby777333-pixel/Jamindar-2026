import { Text, View, ScrollView, Pressable, Share, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { Card, StatCard, Loading, SectionTitle } from "@/components/ui";
import { JamindarFab } from "@/components/Jamindar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";
import { timeAgo } from "@/lib/format";

export default function PromoterDashboard() {
  const router = useRouter();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["promoter-dash", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const [promo, leads, visits] = await Promise.all([
        supabase.from("promoter_profiles").select("*").eq("id", profile!.id).maybeSingle(),
        supabase.from("leads").select("*").eq("promoter_id", profile!.id).order("created_at", { ascending: false }),
        supabase.from("site_visits").select("*").eq("promoter_id", profile!.id).order("created_at", { ascending: false }),
      ]);
      return { promo: promo.data, leads: leads.data ?? [], visits: visits.data ?? [] };
    },
  });

  const referralCode = data?.promo?.referral_code ?? "—";
  const referralLink = `https://jamin.app/r/${referralCode}`;

  async function shareCard() {
    await Share.share({
      message: `${profile?.full_name} — Jamin Properties Promoter\nExplore verified plots & properties: ${referralLink}`,
    });
  }
  async function copyLink() {
    await Clipboard.setStringAsync(referralLink);
    Alert.alert("Copied", "Referral link copied to clipboard.");
  }

  if (isLoading) return <Loading />;

  const newLeads = data!.leads.filter((l: any) => l.status === "new").length;
  const converted = data!.leads.filter((l: any) => l.status === "converted").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>Promoter Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* digital card */}
        <Card style={{ alignItems: "center", paddingVertical: 22 }}>
          <View style={{ backgroundColor: "#fff", padding: 10, borderRadius: 12 }}>
            <QRCode value={referralLink} size={120} color={colors.ink} backgroundColor="#fff" />
          </View>
          <Text style={{ fontWeight: "800", fontSize: 18, color: colors.ink, marginTop: 14 }}>
            {profile?.full_name}
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: 2 }}>Jamin Properties · Promoter</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: colors.brandSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
            <Ionicons name="link" size={14} color={colors.brand} />
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>{referralCode}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <Pressable onPress={shareCard} style={pillBtn}>
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700" }}>Share Card</Text>
            </Pressable>
            <Pressable onPress={copyLink} style={[pillBtn, { backgroundColor: colors.ink }]}>
              <Ionicons name="copy" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700" }}>Copy Link</Text>
            </Pressable>
          </View>
        </Card>

        {/* stats */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 20 }}>
          <StatCard label="Total Leads" value={data!.leads.length} />
          <StatCard label="New" value={newLeads} accent={colors.gold} />
          <StatCard label="Converted" value={converted} accent="#1E9E6A" />
        </View>

        <SectionTitle>Recent Leads</SectionTitle>
        {data!.leads.length > 0 ? (
          data!.leads.slice(0, 10).map((l: any) => (
            <Card key={l.id} style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: colors.ink }}>{l.source?.replace(/_/g, " ") ?? "Lead"}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 12 }}>{timeAgo(l.created_at)}</Text>
              </View>
              <View style={{ backgroundColor: colors.surfaceSunken, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                <Text style={{ color: colors.inkSoft, fontSize: 12, fontWeight: "600" }}>{l.status}</Text>
              </View>
            </Card>
          ))
        ) : (
          <Card>
            <Text style={{ color: colors.inkFaint, textAlign: "center" }}>
              No leads yet. Share your card to start receiving enquiries.
            </Text>
          </Card>
        )}

        <SectionTitle>Site Visit Requests</SectionTitle>
        {data!.visits.length > 0 ? (
          data!.visits.slice(0, 10).map((v: any) => (
            <Card key={v.id} style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Ionicons name="calendar" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: colors.ink }}>Visit · {v.status}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 12 }}>{timeAgo(v.created_at)}</Text>
              </View>
            </Card>
          ))
        ) : (
          <Card>
            <Text style={{ color: colors.inkFaint, textAlign: "center" }}>No site visits requested yet.</Text>
          </Card>
        )}
      </ScrollView>
      <JamindarFab />
    </SafeAreaView>
  );
}

const pillBtn = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 6,
  backgroundColor: colors.brand,
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 999,
};
