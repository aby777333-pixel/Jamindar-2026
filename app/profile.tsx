import { useState } from "react";
import { Text, View, Alert, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Button } from "@/components/ui";
import { Field } from "@/components/Field";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";

const GENDERS = ["Male", "Female", "Other"];

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
  const [email, setEmail] = useState(profile?.email ?? "");
  const [gender, setGender] = useState(profile?.gender ?? "");
  const [dob, setDob] = useState(profile?.dob ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [state, setState] = useState(profile?.state ?? "");
  const [loading, setLoading] = useState(false);

  async function onFinish() {
    if (!profile) return;
    if (name.trim().length < 2) {
      Alert.alert("Name required", "Please enter your full name.");
      return;
    }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      Alert.alert("Check email", "Please enter a valid email address.");
      return;
    }
    if (dob.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
      Alert.alert("Check date of birth", "Please use the format YYYY-MM-DD.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          email: email.trim() || null,
          gender: gender || null,
          dob: dob.trim() || null,
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
        <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />

        <Text style={{ color: colors.inkSoft, fontWeight: "600", marginBottom: 8, fontSize: 13 }}>Gender</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          {GENDERS.map((g) => {
            const on = gender === g;
            return (
              <Pressable key={g} onPress={() => setGender(on ? "" : g)} style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: on ? colors.brand : colors.surface, borderWidth: 1.5, borderColor: on ? colors.brand : colors.border }}>
                <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>{g}</Text>
              </Pressable>
            );
          })}
        </View>

        <Field label="Date of birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" hint="Format: 1990-05-21" />
        <Field label="City" value={city} onChangeText={setCity} placeholder="Chennai" />
        <Field label="State" value={state} onChangeText={setState} placeholder="Tamil Nadu" />

        <Button label="Finish" onPress={onFinish} loading={loading} style={{ marginTop: 8 }} />
      </View>
    </Screen>
  );
}
