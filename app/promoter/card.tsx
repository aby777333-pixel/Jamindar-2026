import { Text, View, ScrollView, Pressable, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import { Loading } from "@/components/ui";
import { PartnerBadge } from "@/components/promoter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import { referralLink, referralMessage, shareReferral, type ShareChannel } from "@/lib/referral";

/** Digital Jamin Promoter Card — premium shareable identity: photo, name,
 *  Promoter ID, Verified Jamin Partner badge, QR, referral link, contact and
 *  service details. One-tap sharing across channels; the share payload always
 *  originates from the promoter's verified profile. */
export default function PromoterCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id;

  const { data: promo, isLoading } = useQuery({
    queryKey: ["promoter-card", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("promoter_profiles").select("*").eq("id", uid!).maybeSingle();
      return data;
    },
  });

  if (isLoading) return <Loading label="Preparing your card…" />;

  const code = profile?.referral_code ?? promo?.referral_code ?? profile?.member_code ?? "—";
  const link = referralLink(code);
  const verified = profile?.partner_status === "verified";
  const area = [profile?.city, profile?.district, profile?.state].filter(Boolean).join(", ") || "Service area not set";
  const language = profile?.preferred_language ?? "English";
  const designation = (promo as any)?.designation ?? "Jamin Partner";

  async function shareCard() {
    await Share.share({ message: referralMessage(code) });
  }

  const channels: { icon: string; label: string; ch: ShareChannel; tint: string; fg: string }[] = [
    { icon: "logo-whatsapp", label: "WhatsApp", ch: "whatsapp", tint: colors.successSoft, fg: colors.success },
    { icon: "chatbox", label: "SMS", ch: "sms", tint: colors.brandSoft, fg: colors.brand },
    { icon: "mail", label: "Email", ch: "email", tint: "#E8F1FE", fg: "#2B6FE1" },
    { icon: "copy", label: "Copy", ch: "copy", tint: colors.surfaceSunken, fg: colors.inkSoft },
    { icon: "ellipsis-horizontal", label: "More", ch: "more", tint: colors.goldSoft, fg: colors.goldDark },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Digital Card</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        {/* the card */}
        <View style={{ backgroundColor: colors.navy, borderRadius: 22, overflow: "hidden", shadowColor: colors.navy, shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 8 }}>
          {/* gold hairline top accent */}
          <View style={{ height: 4, backgroundColor: colors.gold }} />
          <View style={{ padding: space.md }}>
            {/* identity row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.goldLight }}>
                <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>{initials(profile?.full_name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: "#fff", fontSize: T.subhead.fontSize, fontWeight: "800", letterSpacing: -0.3 }}>
                  {profile?.full_name ?? "Jamin Partner"}
                </Text>
                <Text style={{ color: colors.onDarkFaint, fontSize: T.small.fontSize, marginTop: 1 }}>{designation}</Text>
                {profile?.member_code ? (
                  <Text style={{ color: colors.goldLight, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.5, marginTop: 3 }}>
                    ID · {profile.member_code}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* verified badge */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: space.sm, backgroundColor: verified ? "rgba(224,164,35,0.16)" : "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: verified ? "rgba(224,164,35,0.4)" : "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 5 }}>
              <Ionicons name={verified ? "ribbon" : "time"} size={13} color={verified ? colors.goldLight : colors.onDarkFaint} />
              <Text style={{ color: verified ? colors.goldLight : colors.onDarkFaint, fontWeight: "800", fontSize: T.caption.fontSize + 1, letterSpacing: 0.3 }}>
                {verified ? "Verified Jamin Partner" : "Verification pending"}
              </Text>
            </View>

            {/* QR + link */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md }}>
              <View style={{ backgroundColor: "#fff", padding: 8, borderRadius: 14 }}>
                <QRCode value={link} size={92} color={colors.navy} backgroundColor="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Referral code</Text>
                <Text style={{ color: "#fff", fontSize: T.body.fontSize + 1, fontWeight: "800", letterSpacing: 0.4, marginTop: 2 }}>{code}</Text>
                <Text numberOfLines={2} style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: 4 }}>{link}</Text>
              </View>
            </View>

            {/* contact + service details */}
            <View style={{ marginTop: space.md, gap: space.xs, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: space.sm }}>
              <CardRow icon="call" value={profile?.mobile ? `+${profile.mobile}` : "—"} />
              {profile?.email ? <CardRow icon="mail" value={profile.email} /> : null}
              <CardRow icon="location" value={area} />
              <CardRow icon="language" value={language} />
            </View>

            <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize, textAlign: "center", marginTop: space.md, letterSpacing: 0.5 }}>
              Jamin Properties · Signature for Fortune
            </Text>
          </View>
        </View>

        {!verified ? (
          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.sm, lineHeight: T.small.lineHeight }}>
            Your card upgrades to a Verified Jamin Partner card automatically once your KYC is approved.
          </Text>
        ) : null}

        {/* one-tap share */}
        <Pressable
          onPress={shareCard}
          style={{
            marginTop: space.md,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: colors.brand,
            borderRadius: space.sm + 3,
            paddingVertical: space.sm + 2,
          }}
        >
          <Ionicons name="share-social" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: T.body.fontSize }}>Share my card</Text>
        </Pressable>

        {/* channels */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.md }}>
          {channels.map((c) => (
            <Pressable
              key={c.label}
              onPress={async () => {
                await shareReferral(c.ch, code);
              }}
              style={{ alignItems: "center", gap: 6, flex: 1 }}
            >
              <View style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={c.icon as any} size={22} color={c.fg} />
              </View>
              <Text style={{ fontSize: T.caption.fontSize + 1, color: colors.inkSoft, fontWeight: "600" }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CardRow({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Ionicons name={icon as any} size={15} color={colors.goldLight} />
      <Text numberOfLines={1} style={{ flex: 1, color: "#fff", fontSize: T.small.fontSize + 1, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
