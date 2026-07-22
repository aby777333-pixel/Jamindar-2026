import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import * as Localization from "expo-localization";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/store";
import { loadMemory, saveMemory, JAMINDAR_LANGUAGES } from "@/lib/jamindar";
import { Brandmark } from "./Brand";
import { colors } from "@/lib/theme";

// device language code (e.g. "ta") -> Sarvam code
const DEVICE_MAP: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN",
  ml: "ml-IN", mr: "mr-IN", gu: "gu-IN", bn: "bn-IN", pa: "pa-IN",
};

function regionLanguage(): { code: string; label: string } {
  try {
    const locales = Localization.getLocales();
    const lc = locales?.[0]?.languageCode ?? "en";
    const code = DEVICE_MAP[lc] ?? "en-IN";
    const label = JAMINDAR_LANGUAGES.find((l) => l.code === code)?.label ?? "English";
    return { code, label };
  } catch {
    return { code: "en-IN", label: "English" };
  }
}

/** First-run language chooser for the buyer's first interaction.
 *  Shows once (until a language is stored in jamindar_memory). */
export function LanguageGate() {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [showChoose, setShowChoose] = useState(false);
  const region = regionLanguage();

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    loadMemory(profile.id).then((mem) => {
      if (cancelled) return;
      if (!mem || !mem.language) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  async function choose(code: string) {
    if (profile?.id) await saveMemory(profile.id, { language: code }).catch(() => {});
    setVisible(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 22 }}>
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <Brandmark size={44} />
            <Text style={{ fontSize: 19, fontWeight: "800", color: colors.ink, marginTop: 12, textAlign: "center" }}>
              Namaste 🙏 I'm Jamindar
            </Text>
            <Text style={{ color: colors.inkFaint, textAlign: "center", marginTop: 6 }}>
              Would you like to continue in English, choose another language, or use your region's language?
            </Text>
          </View>

          {!showChoose ? (
            <View style={{ gap: 10 }}>
              <GateBtn icon="chatbubbles" title="Continue in English" subtitle="Default" onPress={() => choose("en-IN")} primary />
              <GateBtn icon="language" title="Choose my language" subtitle="Pick from all languages" onPress={() => setShowChoose(true)} />
              <GateBtn icon="location" title="Use my region's language" subtitle={region.label} onPress={() => choose(region.code)} />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
              {JAMINDAR_LANGUAGES.map((l) => (
                <Pressable
                  key={l.code}
                  onPress={() => choose(l.code)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}
                >
                  <Text style={{ fontSize: 16, color: colors.ink, fontWeight: "600" }}>{l.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function GateBtn({
  icon, title, subtitle, onPress, primary,
}: { icon: string; title: string; subtitle: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        backgroundColor: primary ? colors.brand : colors.surfaceAlt,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Ionicons name={icon as any} size={22} color={primary ? "#fff" : colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "700", fontSize: 15, color: primary ? "#fff" : colors.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: primary ? "rgba(255,255,255,0.8)" : colors.inkFaint }}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}
