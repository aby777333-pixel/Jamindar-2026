import { useState } from "react";
import { Text, View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Button } from "@/components/ui";
import { Field } from "@/components/Field";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";
import type { UserRole } from "@/lib/types";

async function ensurePromoterProfile(id: string, name: string) {
  const code = "JMN" + id.replace(/[^0-9a-z]/gi, "").slice(0, 6).toUpperCase();
  await supabase.from("promoter_profiles").upsert(
    { id, referral_code: code, vcard: { name } },
    { onConflict: "id" }
  );
}

export default function ProfileSetup() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [loading, setLoading] = useState(false);

  async function onFinish() {
    if (!profile) return;
    if (name.trim().length < 2) {
      Alert.alert("Name required", "Please enter your full name.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          is_profile_complete: true,
        })
        .eq("id", profile.id);
      if (error) throw error;
      if (profile.role === "promoter") await ensurePromoterProfile(profile.id, name.trim());
      const updated = await refreshProfile();

      if (updated?.role === "buyer") router.replace("/buyer/onboarding");
      else router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Couldn't save profile", e?.message ?? "");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ paddingTop: 24 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.ink }}>Complete your profile</Text>
        <Text style={{ color: colors.inkFaint, marginTop: 6, marginBottom: 20 }}>
          A few details so Jamindar can personalise your experience.
        </Text>

        <Field label="Full name" value={name} onChangeText={setName} placeholder="Abraham" autoFocus />
        <Field label="City" value={city} onChangeText={setCity} placeholder="Chennai" />
        <Field label="State" value={state} onChangeText={setState} placeholder="Tamil Nadu" />

        <Button label="Finish" onPress={onFinish} loading={loading} style={{ marginTop: 8 }} />
      </View>
    </Screen>
  );
}
