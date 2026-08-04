// Premium Buyer → Promoter conversion flow.
//
// Owner directive 04-08 — "a promoter is a promoter": this no longer files an
// application and waits. join_as_promoter() (migration 0073) grants the
// promoter role on the spot, the buyer keeps every buyer feature on the same
// account, and the KYC is what earns the Verified Jamin Partner badge.
import { useState } from "react";
import { Image, Text, View, Pressable, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "@/components/ui";
import { joinAsPromoter } from "@/lib/referral";
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
  "Tap Become a Promoter below — your promoter tools unlock straight away.",
  "Share your referral link, digital card and live projects from day one.",
  "Complete a short KYC and the Jamin team makes you a Verified Jamin Partner.",
];

export default function BecomePromoter() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const ps = profile?.partner_status ?? "none";
  const isPromoter = profile?.role === "promoter";
  const verified = ps === "verified";

  async function apply() {
    if (!profile) return;
    setBusy(true);
    try {
      const res = await joinAsPromoter();
      await refreshProfile();
      Alert.alert(
        "Welcome, Jamin Promoter 🎉",
        res.joined
          ? "Your promoter dashboard, Promoter ID, referral link and digital card are live on this same account. Complete your KYC whenever you like to become a Verified Jamin Partner."
          : "Your promoter tools are already active on this account.",
        [{ text: "Open my dashboard", onPress: () => router.replace("/promoter") }]
      );
    } catch (e: any) {
      Alert.alert("Couldn't continue", e?.message ?? "Please try again.");
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
          ) : isPromoter ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: colors.brandSoft, borderRadius: space.sm, padding: space.sm, marginTop: space.md }}>
                <Ionicons name="briefcase" size={18} color={colors.brand} />
                <Text style={{ flex: 1, color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>
                  You're a Jamin Promoter{profile?.member_code ? ` · ${profile.member_code}` : ""} — your tools are live.
                </Text>
              </View>
              {profile?.kyc_status === "pending" || profile?.kyc_status === "approved" ? (
                <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.sm, lineHeight: 17 }}>
                  {profile.kyc_status === "pending"
                    ? "Your KYC is under review — the Verified Jamin Partner badge follows once it clears."
                    : "Your KYC is verified. The Jamin team will confirm your Verified Jamin Partner badge shortly."}
                </Text>
              ) : (
                <>
                  <Button
                    label={profile?.kyc_status === "rejected" ? "Review my KYC" : "Complete KYC & get verified"}
                    onPress={() => router.push("/buyer/kyc" as Href)}
                    style={{ marginTop: space.sm }}
                  />
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.xs, lineHeight: 16 }}>
                    PAN & Aadhaar are all it takes · Bank and nominee can wait
                  </Text>
                </>
              )}
            </>
          ) : (
            <>
              <Button label="Become a Promoter" onPress={apply} loading={busy} style={{ marginTop: space.md }} />
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.xs, lineHeight: 16 }}>
                Free · Tools unlock instantly · You keep all buyer features
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
