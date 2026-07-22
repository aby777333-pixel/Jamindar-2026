import { useEffect, useState } from "react";
import { Text, View, Pressable, ScrollView, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Button } from "@/components/ui";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";
import {
  loadMemory,
  saveVoicePrefs,
  saveMemory,
  DEFAULT_VOICE_PREFS,
  SPEAKERS,
  JAMINDAR_LANGUAGES,
  type VoicePrefs,
} from "@/lib/jamindar";

export default function JamindarSettings() {
  const router = useRouter();
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [language, setLanguage] = useState("en-IN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    loadMemory(profile.id).then((mem) => {
      if (mem?.voice_prefs) setPrefs({ ...DEFAULT_VOICE_PREFS, ...mem.voice_prefs });
      if (mem?.language) setLanguage(mem.language);
    });
  }, [profile?.id]);

  function setGender(g: "female" | "male") {
    const first = SPEAKERS[g][0].id;
    setPrefs((p) => ({ ...p, gender: g, speaker: first }));
  }

  async function save() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      await saveVoicePrefs(profile.id, prefs);
      await saveMemory(profile.id, { language });
      Alert.alert("Saved", "Your Jamindar preferences are updated.");
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "");
    } finally {
      setSaving(false);
    }
  }

  const paceLabel = prefs.pace <= 0.85 ? "Slower" : prefs.pace >= 1.15 ? "Faster" : "Normal";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>Jamindar Voice</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* language */}
        <Card>
          <Text style={label}>Preferred language</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {JAMINDAR_LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => setLanguage(l.code)}
                style={chip(language === l.code)}
              >
                <Text style={{ color: language === l.code ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* voice */}
        <Card>
          <Text style={label}>Voice</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {(["female", "male"] as const).map((g) => (
              <Pressable key={g} onPress={() => setGender(g)} style={[chip(prefs.gender === g), { flex: 1, alignItems: "center" }]}>
                <Text style={{ color: prefs.gender === g ? "#fff" : colors.inkSoft, fontWeight: "600", textTransform: "capitalize" }}>{g}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {SPEAKERS[prefs.gender].map((s) => (
              <Pressable key={s.id} onPress={() => setPrefs((p) => ({ ...p, speaker: s.id }))} style={chip(prefs.speaker === s.id)}>
                <Text style={{ color: prefs.speaker === s.id ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* pace */}
        <Card>
          <Text style={label}>Speaking speed · {paceLabel}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {([["Slower", 0.8], ["Normal", 1.0], ["Faster", 1.2]] as const).map(([lbl, val]) => (
              <Pressable key={lbl} onPress={() => setPrefs((p) => ({ ...p, pace: val }))} style={[chip(prefs.pace === val), { flex: 1, alignItems: "center" }]}>
                <Text style={{ color: prefs.pace === val ? "#fff" : colors.inkSoft, fontWeight: "600" }}>{lbl}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* style */}
        <Card>
          <Text style={label}>Conversation style</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {(["friendly", "formal"] as const).map((st) => (
              <Pressable key={st} onPress={() => setPrefs((p) => ({ ...p, style: st }))} style={[chip(prefs.style === st), { flex: 1, alignItems: "center" }]}>
                <Text style={{ color: prefs.style === st ? "#fff" : colors.inkSoft, fontWeight: "600", textTransform: "capitalize" }}>{st}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* toggles */}
        <Card>
          <ToggleRow label="Read replies aloud" value={prefs.readAloud} onChange={(v) => setPrefs((p) => ({ ...p, readAloud: v }))} />
          <ToggleRow label="Speak confirmations" value={prefs.spokenConfirm} onChange={(v) => setPrefs((p) => ({ ...p, spokenConfirm: v }))} />
        </Card>

        <Button label="Save preferences" onPress={save} loading={saving} />
      </ScrollView>
    </SafeAreaView>
  );
}

const label = { color: colors.inkSoft, fontWeight: "700" as const, fontSize: 14 };
function chip(active: boolean) {
  return {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: active ? colors.brand : colors.surface,
    borderWidth: 1,
    borderColor: active ? colors.brand : colors.border,
  };
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 15, fontWeight: "500" }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand }} />
    </View>
  );
}
