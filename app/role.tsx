import { useState } from "react";
import { Text, View, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button, elevation } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

// Two ways in, and only two. Super Admin is locked to a fixed mobile allowlist
// enforced by a database trigger (0004), and Promoter is never self-assigned —
// it is granted by an admin on approval (0025). Picking "promoter" here only
// files an application; the account stays a buyer until it is approved.
type Choice = "buyer" | "promoter_application";

const OPTIONS: { key: Choice; title: string; desc: string; icon: string }[] = [
  {
    key: "buyer",
    title: "Create Account as Buyer",
    desc: "Find plots & properties matched to you, book site visits and track your journey.",
    icon: "home",
  },
  {
    key: "promoter_application",
    title: "Apply to Become a Promoter",
    desc: "Share listings, manage leads and earn commissions. Reviewed by the Jamin team before activation.",
    icon: "briefcase",
  },
];

export default function Role() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [selected, setSelected] = useState<Choice>(
    profile?.partner_status === "pending" || profile?.partner_status === "verified"
      ? "promoter_application"
      : "buyer"
  );
  const [loading, setLoading] = useState(false);

  async function onContinue() {
    if (!profile) return;
    setLoading(true);
    try {
      if (selected === "promoter_application") {
        // request_partner() sets partner_status = 'pending' and writes the
        // audit entry. The role is deliberately NOT changed here.
        const { error } = await supabase.rpc("request_partner");
        if (error) throw error;
        await refreshProfile();
        Alert.alert(
          "Application submitted",
          "Thank you. The Jamin team will review your application and verify your details. You can keep using the app as a buyer meanwhile — we'll notify you as soon as you're approved."
        );
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

  const pending = profile?.partner_status === "pending";

  return (
    <Screen>
      <View style={{ paddingTop: space.md }}>
        <Text style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink }}>
          How would you like to join?
        </Text>
        <Text style={{ color: colors.inkFaint, fontSize: T.body.fontSize, lineHeight: T.body.lineHeight, marginTop: space.xs, marginBottom: space.md }}>
          Everyone starts as a buyer. You can apply to become a Jamin Promoter now or any time later.
        </Text>

        {pending ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              backgroundColor: colors.goldSoft,
              borderRadius: space.sm,
              paddingHorizontal: space.sm,
              paddingVertical: space.xs + 2,
              marginBottom: space.sm,
            }}
          >
            <Ionicons name="time" size={16} color={colors.goldDark} />
            <Text style={{ flex: 1, color: colors.goldDark, fontSize: T.small.fontSize, fontWeight: "600" }}>
              Your promoter application is under review.
            </Text>
          </View>
        ) : null}

        {OPTIONS.map((r) => {
          const active = selected === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => setSelected(r.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                backgroundColor: active ? colors.brandSoft : colors.surface,
                borderWidth: 1.5,
                borderColor: active ? colors.brand : colors.border,
                borderTopColor: active ? colors.brand : "#FFFFFF",
                borderRadius: space.md,
                padding: space.sm + 3,
                marginBottom: space.sm,
                ...elevation.low,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: space.sm,
                  backgroundColor: active ? colors.brand : colors.surfaceSunken,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={r.icon as any} size={24} color={active ? "#fff" : colors.inkSoft} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "700", fontSize: T.body.fontSize, color: colors.ink }}>{r.title}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, marginTop: 2 }}>
                  {r.desc}
                </Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={24} color={colors.brand} /> : null}
            </Pressable>
          );
        })}

        <Button
          label={selected === "promoter_application" ? (pending ? "Continue" : "Submit application") : "Continue"}
          onPress={onContinue}
          loading={loading}
          style={{ marginTop: space.sm }}
        />
      </View>
    </Screen>
  );
}
