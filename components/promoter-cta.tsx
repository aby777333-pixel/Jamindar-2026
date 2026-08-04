// Buyer → Promoter conversion prompts, shown across the buyer journey.
// The banner renders ONLY for plain buyers (never for promoters, admins or
// verified partners) so it can be dropped onto any screen without role checks.
import { Text, View, Pressable, Alert } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { shareReferral } from "@/lib/referral";
import { colors, space, type as T } from "@/lib/theme";

/** True when the current user is a buyer who could still become a promoter. */
export function usePromoterEligible(): { show: boolean; pending: boolean } {
  const { profile } = useAuth();
  const role = useEffectiveRole();
  const ps = profile?.partner_status ?? "none";
  return { show: !!profile && role === "buyer" && ps !== "verified", pending: ps === "pending" };
}

/** Premium "Become a Verified Jamin Promoter" banner.
 *  `compact` renders a slim single-row version for dense screens. */
export function BecomePromoterBanner({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const { show, pending } = usePromoterEligible();
  if (!show) return null;

  if (pending) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          backgroundColor: colors.goldSoft,
          borderRadius: space.sm,
          paddingHorizontal: space.sm,
          paddingVertical: space.xs + 3,
        }}
      >
        <Ionicons name="time" size={15} color={colors.goldDark} />
        <Text style={{ flex: 1, color: colors.goldDark, fontSize: T.caption.fontSize + 1, fontWeight: "600" }}>
          Promoter application under review — we'll notify you.
        </Text>
      </View>
    );
  }

  if (compact) {
    return (
      <Pressable
        onPress={() => router.push("/become-promoter" as Href)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.navy,
          borderRadius: space.md,
          paddingHorizontal: space.sm + 2,
          paddingVertical: space.sm + 1,
        }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(224,164,35,0.2)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="ribbon" size={17} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: T.small.fontSize }} numberOfLines={1}>
            Become a Jamin Promoter
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: T.caption.fontSize }} numberOfLines={1}>
            Share this property with your link & earn
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.gold} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => router.push("/become-promoter" as Href)}>
      <LinearGradient
        colors={["#212B47", colors.navy, "#0E1322"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: space.md + 4, padding: space.md, overflow: "hidden" }}
      >
        <View
          pointerEvents="none"
          style={{ position: "absolute", right: -50, top: -60, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(224,164,35,0.16)" }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", backgroundColor: "rgba(224,164,35,0.16)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name="ribbon" size={13} color={colors.gold} />
          <Text style={{ color: colors.gold, fontSize: T.caption.fontSize, fontWeight: "700", letterSpacing: 0.5 }}>EARN WITH JAMIN</Text>
        </View>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.body.fontSize + 2, marginTop: space.sm }}>
          Become a Jamin Promoter
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: T.small.fontSize, lineHeight: T.small.lineHeight + 2, marginTop: 4 }}>
          Unlock the Promoter dashboard, your digital card & QR and commissions on every referral — instantly, while keeping everything you have as a buyer.
        </Text>
        <View
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            backgroundColor: colors.gold,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 9,
            marginTop: space.sm + 2,
          }}
        >
          <Text style={{ color: colors.navy, fontWeight: "800", fontSize: T.small.fontSize }}>See benefits & join</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.navy} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/** Small "invite friends & family" prompt with instant share shortcuts.
 *  Rendered for any signed-in user with a referral code. */
export function InviteFriendsPrompt() {
  const router = useRouter();
  const { profile } = useAuth();
  const code = profile?.referral_code;
  if (!code) return null;

  async function share(ch: "whatsapp" | "sms" | "email" | "copy") {
    const note = await shareReferral(ch, code!);
    if (note) Alert.alert("Done", note);
  }

  const BTNS: { icon: string; label: string; color: string; onPress: () => void }[] = [
    { icon: "logo-whatsapp", label: "WhatsApp", color: "#25D366", onPress: () => share("whatsapp") },
    { icon: "chatbubble-ellipses", label: "SMS", color: "#34C759", onPress: () => share("sms") },
    { icon: "mail", label: "Email", color: "#EA4335", onPress: () => share("email") },
    { icon: "qr-code", label: "QR & more", color: colors.brand, onPress: () => router.push("/referral") },
  ];

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: space.md, padding: space.sm + 3 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="gift" size={18} color={colors.brand} />
        <Text style={{ flex: 1, fontWeight: "700", color: colors.ink, fontSize: T.small.fontSize + 1 }}>
          Invite friends & family to Jamin
        </Text>
      </View>
      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 3 }}>
        Share your invite code {code} — every signup is tracked to you.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: space.sm }}>
        {BTNS.map((b) => (
          <Pressable
            key={b.label}
            onPress={b.onPress}
            style={{ flex: 1, alignItems: "center", gap: 5, backgroundColor: colors.surfaceAlt, borderRadius: space.sm, paddingVertical: space.xs + 4 }}
          >
            <Ionicons name={b.icon as any} size={19} color={b.color} />
            <Text style={{ fontSize: T.caption.fontSize, color: colors.inkSoft, fontWeight: "600" }}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
