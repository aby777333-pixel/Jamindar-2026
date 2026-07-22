import { useState } from "react";
import { Text, View, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";
import type { UserRole } from "@/lib/types";

const ROLES: { key: UserRole; title: string; desc: string; icon: string }[] = [
  { key: "buyer", title: "Buyer", desc: "Find plots & properties matched to you", icon: "home" },
  { key: "promoter", title: "Promoter", desc: "Share listings, manage leads & visits", icon: "briefcase" },
  { key: "super_admin", title: "Super Admin", desc: "Manage the entire Jamin ecosystem", icon: "shield-checkmark" },
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
      <View style={{ paddingTop: 24 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.ink }}>Choose your role</Text>
        <Text style={{ color: colors.inkFaint, marginTop: 6, marginBottom: 20 }}>
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
                gap: 14,
                backgroundColor: active ? colors.brandSoft : colors.surface,
                borderWidth: 1.5,
                borderColor: active ? colors.brand : colors.border,
                borderRadius: 18,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: active ? colors.brand : colors.surfaceSunken,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={r.icon as any} size={24} color={active ? "#fff" : colors.inkSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", fontSize: 16, color: colors.ink }}>{r.title}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 13, marginTop: 2 }}>{r.desc}</Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={24} color={colors.brand} /> : null}
            </Pressable>
          );
        })}

        <Button label="Continue" onPress={onContinue} loading={loading} style={{ marginTop: 12 }} />
      </View>
    </Screen>
  );
}
