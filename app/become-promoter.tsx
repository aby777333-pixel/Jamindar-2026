// Premium Buyer → Promoter conversion flow. The application itself reuses the
// 0025 workflow: request_partner() files it, the admin verifies from the
// console (Partners), and approval grants the promoter role — the user keeps
// every buyer feature on the same account.
import { useState } from "react";
import { Image, Text, View, Pressable, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

const BENEFITS: { icon: string; title: string; desc: string }[] = [
  { icon: "cash", title: "Earn commissions", desc: "Get paid for every buyer you refer — direct and network sales." },
  { icon: "link", title: "Verified property links", desc: "Share official Jamin listings with your referral built in." },
  { icon: "ribbon", title: "Verified Promoter badge", desc: "Stand out with the official Jamin verification mark." },
  { icon: "stats-chart", title: "Promoter dashboard", desc: "Earnings, leads, analytics and marketing tools in one place." },
  { icon: "qr-code", title: "Digital business card", desc: "Your own V-card with QR code and shareable referral link." },
  { icon: "home", title: "Keep your buyer account", desc: "Everything you use as a buyer stays — same login, more power." },
];

const STEPS = [
  "Tap Become a Promoter below.",
  "Your application goes to the Jamin team for verification.",
  "Once approved, promoter tools unlock on this same account.",
];

export default function BecomePromoter() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const ps = profile?.partner_status ?? "none";
  const pending = ps === "pending";
  const verified = ps === "verified";

  async function apply() {
    if (!profile) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("request_partner");
      if (error) throw error;
      await refreshProfile();
      Alert.alert(
        "Application submitted 🎉",
        "Thank you! The Jamin team will verify your details shortly. You can keep using the app as usual — we'll notify you the moment you're approved."
      );
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* hero */}
        <LinearGradient colors={["#212B47", colors.navy, "#0E1322"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingBottom: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: "#fff", letterSpacing: -0.4 }}>Become a Promoter</Text>
          </View>
          <View style={{ alignItems: "center", paddingHorizontal: 20 }}>
            <View style={{ borderRadius: 999, borderWidth: 2, borderColor: "rgba(224,164,35,0.55)", padding: 3, backgroundColor: "#fff" }}>
              <Image source={require("../assets/namaste.jpg")} style={{ width: 96, height: 96, borderRadius: 999 }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(224,164,35,0.16)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: space.sm }}>
              <Ionicons name="ribbon" size={13} color={colors.gold} />
              <Text style={{ color: colors.gold, fontSize: T.caption.fontSize, fontWeight: "700", letterSpacing: 0.6 }}>VERIFIED JAMIN PROMOTER</Text>
            </View>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.title.fontSize, textAlign: "center", marginTop: space.xs }}>
              Turn your network into earnings
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: T.small.fontSize, lineHeight: T.small.lineHeight + 2, textAlign: "center", marginTop: 4, maxWidth: 320 }}>
              Refer buyers to verified Jamin properties and get rewarded — with professional tools to back you up.
            </Text>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: -space.md }}>
          {/* benefits */}
          <View style={{ backgroundColor: colors.surface, borderRadius: space.md + 4, borderWidth: 1, borderColor: colors.border, padding: space.sm + 4, gap: space.sm + 2 }}>
            {BENEFITS.map((b) => (
              <View key={b.title} style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={b.icon as any} size={18} color={colors.goldDark} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "700", color: colors.ink, fontSize: T.small.fontSize + 1 }}>{b.title}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 2, lineHeight: 17, marginTop: 1 }}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* how it works */}
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.body.fontSize, marginTop: space.md, marginBottom: space.sm }}>
            How it works
          </Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: space.md, borderWidth: 1, borderColor: colors.border, padding: space.sm + 3, gap: space.sm }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.gold, fontWeight: "800", fontSize: 12 }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: colors.inkSoft, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight + 2 }}>{s}</Text>
              </View>
            ))}
          </View>

          {/* status / CTA */}
          {verified ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: colors.successSoft, borderRadius: space.sm, padding: space.sm, marginTop: space.md }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ flex: 1, color: colors.success, fontWeight: "700", fontSize: T.small.fontSize }}>
                You're already a Verified Jamin Bazaar Partner{profile?.partner_code ? ` · ${profile.partner_code}` : ""}.
              </Text>
            </View>
          ) : pending ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: colors.goldSoft, borderRadius: space.sm, padding: space.sm, marginTop: space.md }}>
              <Ionicons name="time" size={18} color={colors.goldDark} />
              <Text style={{ flex: 1, color: colors.goldDark, fontWeight: "600", fontSize: T.small.fontSize }}>
                Your application is under review. We'll notify you as soon as it's approved.
              </Text>
            </View>
          ) : (
            <>
              <Button label="Become a Promoter" onPress={apply} loading={busy} style={{ marginTop: space.md }} />
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.xs, lineHeight: 16 }}>
                Free to apply · Verified by the Jamin team · You keep all buyer features
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
