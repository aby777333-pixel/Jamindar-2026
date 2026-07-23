import { useState } from "react";
import { Text, View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { fetchReferralStats, requestPartner, shareReferral, qrUrl, referralLink, type ShareChannel } from "@/lib/referral";

const CHANNELS: { key: ShareChannel; label: string; icon: string; color: string }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp", color: "#25D366" },
  { key: "telegram", label: "Telegram", icon: "paper-plane", color: "#229ED9" },
  { key: "sms", label: "SMS", icon: "chatbubble-ellipses", color: "#34C759" },
  { key: "email", label: "Email", icon: "mail", color: "#EA4335" },
  { key: "facebook", label: "Facebook", icon: "logo-facebook", color: "#1877F2" },
  { key: "x", label: "X", icon: "logo-twitter", color: "#111111" },
  { key: "instagram", label: "Instagram", icon: "logo-instagram", color: "#E1306C" },
  { key: "copy", label: "Copy link", icon: "copy", color: colors.inkSoft },
];

const STATS: { key: keyof Awaited<ReturnType<typeof fetchReferralStats>>; label: string }[] = [
  { key: "clicks", label: "Link clicks" },
  { key: "registrations", label: "Registrations" },
  { key: "kyc_completed", label: "KYC done" },
  { key: "enquiries", label: "Enquiries" },
  { key: "site_visits", label: "Site visits" },
  { key: "purchases", label: "Purchases" },
];

export default function ReferralCentre() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const code = profile?.referral_code ?? "";

  const { data: stats } = useQuery({ queryKey: ["referral-stats", profile?.id], enabled: !!profile?.id, queryFn: fetchReferralStats });

  async function onChannel(ch: ShareChannel) {
    if (!code) return;
    const note = await shareReferral(ch, code);
    if (note) Alert.alert("Done", note);
  }

  async function onBecomePartner() {
    setBusy(true);
    try {
      await requestPartner();
      await refreshProfile();
      Alert.alert("Request submitted", "Our team will review your partner verification shortly.");
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const ps = profile?.partner_status ?? "none";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Referral Centre</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {profile?.referred_by ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.successSoft, borderRadius: 12, padding: 12, marginBottom: space.md }}>
            <Ionicons name="gift" size={18} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 13, fontWeight: "600" }}>You joined through a Jamin referral.</Text>
          </View>
        ) : null}

        {/* code + QR */}
        <Card style={{ alignItems: "center", paddingVertical: space.lg }}>
          <Text style={{ color: colors.inkFaint, fontSize: 12, fontWeight: "500", letterSpacing: 0.4 }}>YOUR INVITE CODE</Text>
          <Text style={{ color: colors.ink, fontSize: T.title.fontSize - 2, fontWeight: "700", letterSpacing: 1, marginTop: 6 }}>{code || "—"}</Text>
          {code ? (
            <Image source={{ uri: qrUrl(code) }} style={{ width: 180, height: 180, marginTop: space.md, borderRadius: 14, backgroundColor: colors.surface }} />
          ) : null}
          <Text style={{ color: colors.inkFaint, fontSize: 11, marginTop: 10, textAlign: "center" }} numberOfLines={1}>{code ? referralLink(code) : ""}</Text>
          <Pressable onPress={() => onChannel("copy")} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: colors.brandSoft, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 }}>
            <Ionicons name="copy" size={15} color={colors.brand} />
            <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 13 }}>Copy link</Text>
          </Pressable>
        </Card>

        {/* share channels */}
        <Text style={{ fontWeight: "600", fontSize: 15, color: colors.ink, marginTop: space.md, marginBottom: space.sm }}>Share your invite</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {CHANNELS.map((c) => (
            <Pressable key={c.key} onPress={() => onChannel(c.key)} style={{ width: "22%", alignItems: "center", gap: 6 }}>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={c.icon as any} size={24} color={c.color} />
              </View>
              <Text style={{ fontSize: 11, color: colors.inkSoft }}>{c.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => onChannel("more")} style={{ width: "22%", alignItems: "center", gap: 6 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.inkSoft} />
            </View>
            <Text style={{ fontSize: 11, color: colors.inkSoft }}>More</Text>
          </Pressable>
        </View>

        {/* stats */}
        <Text style={{ fontWeight: "600", fontSize: 15, color: colors.ink, marginTop: space.lg, marginBottom: space.sm }}>Your referrals</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {STATS.map((s) => (
            <Card key={s.key} style={{ width: "31%", paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "700", color: colors.ink }}>{stats ? stats[s.key] : "—"}</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 11, marginTop: 2, textAlign: "center" }}>{s.label}</Text>
            </Card>
          ))}
        </View>

        {/* partner tier */}
        <View style={{ marginTop: space.lg, borderRadius: 20, overflow: "hidden", backgroundColor: colors.navy, padding: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="ribbon" size={20} color={colors.gold} />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Jamin Partner</Text>
          </View>
          {ps === "verified" ? (
            <>
              <Text style={{ color: colors.gold, fontWeight: "600", marginTop: 10 }}>✅ Verified Jamin Partner</Text>
              {profile?.partner_code ? <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4 }}>Partner ID · {profile.partner_code}</Text> : null}
              {profile?.partner_verified_at ? <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Approved {new Date(profile.partner_verified_at).toLocaleDateString()}</Text> : null}
            </>
          ) : ps === "pending" ? (
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 10, lineHeight: 20 }}>⏳ Your partner verification is under review. We'll notify you once it's approved.</Text>
          ) : (
            <>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 8, lineHeight: 20 }}>
                {ps === "rejected" ? "Your previous request wasn't approved. You can apply again." : "Refer, earn rewards, and unlock partner tools. Get verified to become an official Jamin Partner."}
              </Text>
              <Pressable onPress={onBecomePartner} disabled={busy} style={{ marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.gold, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 }}>
                {busy ? <ActivityIndicator color={colors.navy} /> : <Ionicons name="shield-checkmark" size={16} color={colors.navy} />}
                <Text style={{ color: colors.navy, fontWeight: "700", fontSize: 13 }}>Become a Verified Partner</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
