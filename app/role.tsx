import { useState } from "react";
import { Image, Text, View, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button, elevation } from "@/components/ui";
import { joinAsPromoter } from "@/lib/referral";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

// Two ways in, and only two. Super Admin is locked to a fixed mobile allowlist
// enforced by a database trigger (0004).
//
// Owner directive 04-08 — "a promoter is a promoter": picking "promoter" here
// now GRANTS the promoter role on the spot (join_as_promoter, migration 0073),
// so the whole app treats and shows them as a promoter from the first screen.
// What still has to be earned is the Verified Jamin Partner badge: complete
// the KYC, and the Jamin team approves it.
type Choice = "buyer" | "promoter";

const TABS: { key: Choice; label: string }[] = [
  { key: "buyer", label: "Enter as a Buyer" },
  { key: "promoter", label: "Enter as a Promoter" },
];

const BENEFITS: Record<Choice, { icon: string; text: string }[]> = {
  buyer: [
    { icon: "shield-checkmark", text: "Browse verified plots, farms & villas with clear titles" },
    { icon: "calendar", text: "Book free site visits at your convenience" },
    { icon: "sparkles", text: "Ask Jamindar — your AI advisor, by voice, in your language" },
    { icon: "document-text", text: "Plain-language legal guidance: Patta, EC, RERA & more" },
    { icon: "calculator", text: "EMI, stamp-duty & loan-eligibility calculators" },
    { icon: "heart", text: "Save properties, compare up to 3 and get matched picks" },
  ],
  promoter: [
    { icon: "card", text: "Your own digital V-card & Promoter ID to share" },
    { icon: "share-social", text: "Share listings with your referral link built in" },
    { icon: "people", text: "Leads dashboard — every enquiry attributed to you" },
    { icon: "cash", text: "Earn commissions on direct & network sales" },
    { icon: "git-network", text: "Grow your team and track your referral tree" },
    { icon: "trending-up", text: "Earnings, visits and performance in one place" },
  ],
};

const HEADLINE: Record<Choice, string> = {
  buyer: "Find land you can trust",
  promoter: "Turn your network into earnings",
};

export default function Role() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const isPromoter = profile?.role === "promoter";
  const verified = profile?.partner_status === "verified";
  const [tab, setTab] = useState<Choice>(isPromoter ? "promoter" : "buyer");
  const [loading, setLoading] = useState(false);

  async function onContinue() {
    if (!profile) return;
    setLoading(true);
    try {
      if (tab === "promoter") {
        // join_as_promoter() grants the promoter role, opens the promoter
        // profile (referral link + V-card) and leaves partner_status pending
        // until the KYC is verified. Idempotent, so re-entering is harmless.
        const res = await joinAsPromoter();
        await refreshProfile();
        if (res.joined) {
          Alert.alert(
            "Welcome, Jamin Promoter 🎉",
            "Your promoter dashboard, Promoter ID, referral link and digital card are ready to use right away. Complete your KYC whenever you like to become a Verified Jamin Partner."
          );
        }
      } else {
        await refreshProfile();
      }
      router.replace("/profile");
    } catch (e: any) {
      Alert.alert("Couldn't continue", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.xs }}>
        {/* the Jamindar man welcomes every new member */}
        <View style={{ alignItems: "center" }}>
          <Image
            source={require("../assets/namaste.jpg")}
            style={{ width: 148, height: 148, resizeMode: "contain" }}
          />
        </View>

        <Text
          style={{
            fontSize: T.title.fontSize,
            lineHeight: T.title.lineHeight,
            fontWeight: "800",
            color: colors.ink,
            textAlign: "center",
            marginTop: space.xs,
          }}
        >
          How would you like to join?
        </Text>

        {/* two tabs — buyer / promoter */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.surfaceSunken,
            borderRadius: space.sm + 3,
            padding: 4,
            marginTop: space.md,
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flex: 1,
                  paddingVertical: space.xs + 4,
                  borderRadius: space.sm,
                  backgroundColor: active ? colors.surface : "transparent",
                  alignItems: "center",
                  ...(active ? elevation.low : null),
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{
                    fontWeight: active ? "800" : "600",
                    fontSize: T.small.fontSize,
                    color: active ? colors.brand : colors.inkFaint,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text
          style={{
            fontWeight: "800",
            fontSize: T.body.fontSize + 1,
            color: colors.ink,
            marginTop: space.md,
          }}
        >
          {HEADLINE[tab]}
        </Text>

        {/* benefits */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: space.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: space.sm + 3,
            marginTop: space.sm,
            gap: space.sm,
            ...elevation.low,
          }}
        >
          {BENEFITS[tab].map((b) => (
            <View key={b.text} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: tab === "buyer" ? colors.brandSoft : colors.goldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={b.icon as any}
                  size={17}
                  color={tab === "buyer" ? colors.brand : colors.goldDark}
                />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: colors.inkSoft,
                  fontSize: T.small.fontSize,
                  lineHeight: T.small.lineHeight + 2,
                  fontWeight: "500",
                }}
              >
                {b.text}
              </Text>
            </View>
          ))}
        </View>

        {tab === "promoter" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              backgroundColor: colors.goldSoft,
              borderRadius: space.sm,
              paddingHorizontal: space.sm,
              paddingVertical: space.xs + 2,
              marginTop: space.sm,
            }}
          >
            <Ionicons name={verified ? "ribbon" : "shield-checkmark"} size={16} color={colors.goldDark} />
            <Text style={{ flex: 1, color: colors.goldDark, fontSize: T.caption.fontSize + 1, fontWeight: "600" }}>
              {verified
                ? "You're a Verified Jamin Partner — your promoter suite is ready."
                : "Start promoting straight away. A short KYC makes you a Verified Jamin Partner."}
            </Text>
          </View>
        ) : null}

        <Button
          label={tab === "promoter" ? "Continue as Promoter" : "Continue as Buyer"}
          onPress={onContinue}
          loading={loading}
          style={{ marginTop: space.md }}
        />
      </View>
    </Screen>
  );
}
