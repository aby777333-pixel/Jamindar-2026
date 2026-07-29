import { useState } from "react";
import { Text, View, ScrollView, Pressable, Share, Image, Modal, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import { Loading } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import { pickAndUploadAvatar } from "@/lib/property-media";
import { cardLink, cardMessage, shareVia, type ShareChannel } from "@/lib/referral";

/** Digital Jamin Promoter Card — premium shareable identity: professional
 *  photo (mandatory), name, Promoter ID, Verified Jamin Bazaar Partner badge with
 *  admin-controlled state, QR + public V-Card link, contact details and
 *  one-tap sharing. The share payload always originates from the promoter's
 *  verified profile; the QR and links open the public premium card page. */
export default function PromoterCard() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const uid = profile?.id;
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const { data: promo, isLoading } = useQuery({
    queryKey: ["promoter-card", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("promoter_profiles").select("*").eq("id", uid!).maybeSingle();
      return data;
    },
  });

  if (isLoading) return <Loading label="Preparing your card…" />;

  // Audit 29-07: the em-dash placeholder used to leak into the share link and
  // QR ("/card?c=%E2%80%94" → "Card not found"). No real code → no share/QR.
  const code = profile?.partner_code ?? profile?.referral_code ?? promo?.referral_code ?? profile?.member_code ?? "";
  const refCode = profile?.referral_code ?? promo?.referral_code ?? profile?.member_code ?? "";
  const link = code ? cardLink(code) : "";
  const verified = profile?.partner_status === "verified";
  const hasPhoto = !!profile?.avatar_url;
  const shareable = hasPhoto && !!code;
  const area = [profile?.city, profile?.district, profile?.state].filter(Boolean).join(", ") || "Service area not set";
  const designation = (promo as any)?.designation ?? "Jamin Partner";

  /** Professional photo is mandatory — upload straight from the card. */
  async function onAddPhoto() {
    if (!profile || photoBusy) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      const url = await pickAndUploadAvatar(profile.id);
      if (url) {
        await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
        await refreshProfile();
      }
    } catch (e: any) {
      setPhotoErr(e?.message ?? "Couldn't upload the photo. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function shareCard() {
    if (!shareable) return;
    await Share.share({ message: cardMessage(profile?.full_name, code) });
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
        <View style={{ backgroundColor: colors.navy, borderRadius: 24, overflow: "hidden", shadowColor: colors.navy, shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 8 }}>
          {/* gold hairline top accent */}
          <View style={{ height: 4, backgroundColor: colors.gold }} />
          <View style={{ padding: space.md, paddingTop: space.lg }}>
            {/* premium photo hero — centred portrait with gold ring */}
            <View style={{ alignItems: "center" }}>
              <View style={{ width: 104, height: 104, borderRadius: 52, padding: 3, backgroundColor: colors.gold }}>
                <View style={{ flex: 1, borderRadius: 49, overflow: "hidden", backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.navy }}>
                  {hasPhoto ? (
                    <Image source={{ uri: profile!.avatar_url! }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={{ color: "#fff", fontSize: 36, fontWeight: "800" }}>{initials(profile?.full_name)}</Text>
                  )}
                </View>
                {/* green verified check — admin-controlled, tap for details */}
                {verified ? (
                  <Pressable
                    onPress={() => setBadgeOpen(true)}
                    hitSlop={6}
                    style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.success, borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </Pressable>
                ) : null}
                {/* photo add/change control on the ring */}
                <Pressable
                  onPress={onAddPhoto}
                  hitSlop={6}
                  style={{ position: "absolute", top: -2, right: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center" }}
                >
                  {photoBusy ? <ActivityIndicator size="small" color={colors.navy} /> : <Ionicons name="camera" size={15} color={colors.navy} />}
                </Pressable>
              </View>

              <Text numberOfLines={1} style={{ color: "#fff", fontSize: T.subhead.fontSize + 1, fontWeight: "800", letterSpacing: -0.3, marginTop: space.sm }}>
                {profile?.full_name ?? "Jamin Partner"}
              </Text>
              <Text style={{ color: colors.onDarkFaint, fontSize: T.small.fontSize, marginTop: 2 }}>{designation}</Text>
              {profile?.partner_code || profile?.member_code ? (
                <Text style={{ color: colors.goldLight, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.6, marginTop: 4 }}>
                  ID · {profile?.partner_code ?? profile?.member_code}
                </Text>
              ) : null}

              {/* verified badge pill — green, tappable, admin-controlled */}
              <Pressable
                onPress={() => (verified ? setBadgeOpen(true) : undefined)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: space.sm, backgroundColor: verified ? "rgba(20,160,90,0.18)" : "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: verified ? "rgba(20,160,90,0.5)" : "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 5 }}
              >
                <Ionicons name={verified ? "checkmark-circle" : "time"} size={14} color={verified ? "#3DD68C" : colors.onDarkFaint} />
                <Text style={{ color: verified ? "#3DD68C" : colors.onDarkFaint, fontWeight: "800", fontSize: T.caption.fontSize + 1, letterSpacing: 0.3 }}>
                  {verified ? "Verified Jamin Bazaar Partner" : "Verification pending"}
                </Text>
              </Pressable>
            </View>

            {/* QR + public card link */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md }}>
              <View style={{ backgroundColor: "#fff", padding: 8, borderRadius: 14 }}>
                {link ? <QRCode value={link} size={92} color={colors.navy} backgroundColor="#fff" /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>Referral code</Text>
                <Text style={{ color: "#fff", fontSize: T.body.fontSize + 1, fontWeight: "800", letterSpacing: 0.4, marginTop: 2 }}>{refCode}</Text>
                <Text numberOfLines={2} style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: 4 }}>{link}</Text>
              </View>
            </View>

            {/* contact + service details */}
            <View style={{ marginTop: space.md, gap: space.xs, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: space.sm }}>
              <CardRow icon="call" value={profile?.mobile ? `+${profile.mobile}` : "—"} />
              {profile?.email ? <CardRow icon="mail" value={profile.email} /> : null}
              <CardRow icon="location" value={area} />
            </View>

            <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize, textAlign: "center", marginTop: space.md, letterSpacing: 0.5 }}>
              Jamin Bazaar · Signature for Fortune
            </Text>
          </View>
        </View>

        {/* mandatory professional photo — card activates only with one */}
        {!hasPhoto ? (
          <Pressable
            onPress={onAddPhoto}
            style={{ marginTop: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(224,164,35,0.45)", borderRadius: 16, padding: space.sm + 2 }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
              {photoBusy ? <ActivityIndicator size="small" color={colors.goldDark} /> : <Ionicons name="camera" size={19} color={colors.goldDark} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 1 }}>Add your professional photo</Text>
              <Text style={{ color: colors.inkSoft, fontSize: T.caption.fontSize + 1, marginTop: 2, lineHeight: T.caption.lineHeight }}>
                A profile photograph is required before your card can be shared.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.goldDark} />
          </Pressable>
        ) : null}
        {photoErr ? (
          <Text style={{ color: colors.brand, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: 6 }}>{photoErr}</Text>
        ) : null}

        {!verified ? (
          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.sm, lineHeight: T.small.lineHeight }}>
            Your card upgrades to a Verified Jamin Bazaar Partner card automatically once the administration approves you.
          </Text>
        ) : null}

        {/* one-tap share — needs the mandatory photo */}
        <Pressable
          onPress={shareCard}
          disabled={!shareable}
          style={{
            marginTop: space.md,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: shareable ? colors.brand : colors.surfaceSunken,
            borderRadius: space.sm + 3,
            paddingVertical: space.sm + 2,
          }}
        >
          <Ionicons name="share-social" size={18} color={shareable ? "#fff" : colors.inkFaint} />
          <Text style={{ color: shareable ? "#fff" : colors.inkFaint, fontWeight: "700", fontSize: T.body.fontSize }}>Share my card</Text>
        </Pressable>

        {/* open the public premium card */}
        <Pressable
          onPress={() => Linking.openURL(link).catch(() => {})}
          style={{ marginTop: space.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.navy, borderRadius: space.sm + 3, paddingVertical: space.sm + 2 }}
        >
          <Ionicons name="globe-outline" size={17} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: T.small.fontSize + 1 }}>Preview my public card</Text>
        </Pressable>

        {/* channels */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.md }}>
          {channels.map((c) => (
            <Pressable
              key={c.label}
              disabled={!shareable}
              onPress={async () => {
                await shareVia(c.ch, cardMessage(profile?.full_name, code), link, "My Jamin Bazaar card");
              }}
              style={{ alignItems: "center", gap: 6, flex: 1, opacity: shareable ? 1 : 0.45 }}
            >
              <View style={{ width: 50, height: 50, borderRadius: 16, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={c.icon as any} size={22} color={c.fg} />
              </View>
              <Text style={{ fontSize: T.caption.fontSize + 1, color: colors.inkSoft, fontWeight: "600" }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* verified-badge popup (spec copy, works on web too — Alert is a web no-op) */}
      <Modal visible={badgeOpen} transparent animationType="fade" onRequestClose={() => setBadgeOpen(false)}>
        <Pressable onPress={() => setBadgeOpen(false)} style={{ flex: 1, backgroundColor: "rgba(20,26,46,0.6)", alignItems: "center", justifyContent: "center", padding: 26 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#fff", borderRadius: 22, padding: 26, maxWidth: 340, alignItems: "center" }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Ionicons name="checkmark" size={28} color="#fff" />
            </View>
            <Text style={{ fontSize: T.body.fontSize + 1, fontWeight: "800", color: colors.ink }}>Verified Jamin Bazaar Partner</Text>
            <Text style={{ color: colors.inkSoft, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, textAlign: "center", marginTop: 8 }}>
              This promoter has been verified and approved by the Jamin Promoters administration.
            </Text>
            <Pressable onPress={() => setBadgeOpen(false)} style={{ marginTop: 16, backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 26 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: T.small.fontSize }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
