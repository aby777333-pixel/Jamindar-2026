import { useState } from "react";
import { Text, View, Alert, Pressable, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button } from "@/components/ui";
import { Field } from "@/components/Field";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { pickAndUploadAvatar } from "@/lib/property-media";
import { initials } from "@/lib/format";
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
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onPickAvatar() {
    if (!profile) return;
    setAvatarBusy(true);
    try {
      const url = await pickAndUploadAvatar(profile.id);
      if (url) {
        await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
        setAvatarUrl(url);
        await refreshProfile();
      }
    } catch (e: any) {
      Alert.alert("Couldn't upload photo", e?.message ?? "Please try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

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
          avatar_url: avatarUrl || null,
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
        {/* profile photo */}
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <Pressable onPress={onPickAvatar} disabled={avatarBusy}>
            <View style={{ width: 96, height: 96, borderRadius: 30, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 3, borderColor: colors.brandSoft }}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text style={{ color: "#fff", fontSize: 34, fontWeight: "800" }}>{initials(name || profile?.full_name)}</Text>
              )}
              {avatarBusy ? (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </View>
            <View style={{ position: "absolute", right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Pressable>
          <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 8 }}>Tap to add your photo</Text>
        </View>

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
