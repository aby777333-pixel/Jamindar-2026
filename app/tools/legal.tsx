import { useState } from "react";
import { Text, View, Pressable, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { colors } from "@/lib/theme";
import { LEGAL_TERMS } from "@/lib/legal";

export default function LegalGuide() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const list = LEGAL_TERMS.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.term.toLowerCase().includes(q) || t.short.toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>Legal Guide</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 13 }}>Property terms in plain language</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 }}>
          <Ionicons name="search" size={18} color={colors.inkFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search a term (e.g. Patta, EC, RERA)…"
            placeholderTextColor={colors.inkFaint}
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, color: colors.ink }}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 10 }} showsVerticalScrollIndicator={false}>
        {list.map((t) => {
          const open = openTerm === t.term;
          return (
            <Card key={t.term} onPress={() => setOpenTerm(open ? null : t.term)}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: colors.ink }}>{t.term}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }}>{t.short}</Text>
                </View>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.inkFaint} />
              </View>
              {open ? (
                <Text style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 21, marginTop: 10 }}>{t.detail}</Text>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
