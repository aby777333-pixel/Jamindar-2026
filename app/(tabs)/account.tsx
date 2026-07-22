import { Text, View, Pressable, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { Badge } from "@/components/premium";
import { RolePreviewBar } from "@/components/RolePreview";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { colors, space } from "@/lib/theme";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/types";

export default function Account() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const role = useEffectiveRole();

  const rows: { icon: string; label: string; onPress: () => void }[] = [
    { icon: "person-circle", label: "Edit profile", onPress: () => router.push("/profile") },
    { icon: "sparkles", label: "Jamindar assistant", onPress: () => router.push("/(tabs)/assistant") },
    { icon: "mic", label: "Jamindar voice settings", onPress: () => router.push("/jamindar/settings") },
    { icon: "calculator", label: "Calculators", onPress: () => router.push("/tools/calculators") },
    { icon: "git-compare", label: "Compare properties", onPress: () => router.push("/tools/compare") },
    { icon: "document-text", label: "Legal guide", onPress: () => router.push("/tools/legal") },
  ];
  if (role === "buyer") rows.splice(1, 0, { icon: "options", label: "Buyer preferences", onPress: () => router.push("/buyer/onboarding") });
  if (role === "promoter") rows.push({ icon: "briefcase", label: "Promoter dashboard", onPress: () => router.push("/promoter") });
  // Admin console is always reachable for real super admins, even while previewing another role.
  if (profile?.role === "super_admin") rows.push({ icon: "shield-checkmark", label: "Admin console", onPress: () => router.push("/admin") });

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut().then(() => router.replace("/welcome")) },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: "center", paddingVertical: space.lg, marginBottom: space.md }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 3,
              borderColor: colors.brandSoft,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 32, fontWeight: "800" }}>{initials(profile?.full_name)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>
              {profile?.full_name ?? "Guest"}
            </Text>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          </View>
          <Text style={{ color: colors.inkFaint, marginTop: 2, fontSize: 13 }}>+{profile?.mobile}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: space.sm }}>
            <Badge label={ROLE_LABELS[role].toUpperCase()} tone="role" />
            <Badge label="VERIFIED" tone="verified" icon="shield-checkmark" />
          </View>
        </Card>

        {profile?.role === "super_admin" ? (
          <View style={{ marginBottom: 16 }}>
            <RolePreviewBar />
          </View>
        ) : null}

        <Card style={{ padding: 0 }}>
          {rows.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={r.onPress}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderTopWidth: i === 0 ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name={r.icon as any} size={22} color={colors.brand} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink }}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </Pressable>
          ))}
        </Card>

        <Pressable
          onPress={confirmSignOut}
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Sign out</Text>
        </Pressable>

        <Text style={{ textAlign: "center", color: colors.inkFaint, fontSize: 12, marginTop: 24 }}>
          Jamin Properties · Signature for Fortune
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
