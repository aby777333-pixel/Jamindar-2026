import { useState } from "react";
import { Text, View, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button, elevation } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import type { UserRole } from "@/lib/types";

// Super Admin is intentionally NOT selectable here — it is locked to a fixed
// mobile allowlist and enforced by a database trigger (see migration 0004).
const ROLES: { key: UserRole; title: string; desc: string; icon: string }[] = [
  { key: "buyer", title: "Buyer", desc: "Find plots & properties matched to you", icon: "home" },
  { key: "promoter", title: "Promoter", desc: "Share listings, manage leads & visits", icon: "briefcase" },
];

export default function Role() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [selected, setSelected] = useState<UserRole>(profile?.role ?? "buyer");
  const [loading, setLoading] = useState(false);

  async function onContinue() {
    if (!profile) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: selected })
        .eq("id", profile.id);
      if (error) throw error;
      await refreshProfile();
      router.replace("/profile");
    } catch (e: any) {
      Alert.alert("Couldn't save role", e?.message ?? "");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ paddingTop: space.md }}>
        <Text style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink }}>
          Choose your role
        </Text>
        <Text style={{ color: colors.inkFaint, fontSize: T.body.fontSize, lineHeight: T.body.lineHeight, marginTop: space.xs, marginBottom: space.md }}>
          You can be upgraded later by an administrator.
        </Text>

        {ROLES.map((r) => {
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
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: T.body.fontSize, color: colors.ink }}>{r.title}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, marginTop: 2 }}>{r.desc}</Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={24} color={colors.brand} /> : null}
            </Pressable>
          );
        })}

        <Button label="Continue" onPress={onContinue} loading={loading} style={{ marginTop: space.sm }} />
      </View>
    </Screen>
  );
}
