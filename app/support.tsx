import { useState } from "react";
import { Text, View, ScrollView, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { colors, space, type as T } from "@/lib/theme";

const SUPPORT_EMAIL = "info@jaminproperties.com";

const FAQ = [
  { q: "How do I book a site visit?", a: "Open any property and tap “Schedule Site Visit”. Our team will call you to confirm a convenient date and time." },
  { q: "Is my KYC information safe?", a: "Yes. Your documents are stored privately and shared only with the Jamin verification team for KYC purposes." },
  { q: "How are properties verified?", a: "Every listing is checked for approvals (RERA/DTCP), ownership and legal status before it is published." },
  { q: "How does the referral programme work?", a: "Share your invite code from the Referral Centre. You can track clicks, registrations and rewards, and apply to become a Verified Jamin Partner." },
  { q: "What payment plans are available?", a: "Plans vary by project. Use the in-app EMI and registration calculators, or contact us for a tailored plan." },
];

export default function Support() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Support</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* contact */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: space.md }}>
          <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Jamin Properties — Support")}`).catch(() => {})} style={{ flex: 1 }}>
            <Card style={{ alignItems: "center", paddingVertical: 18 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="mail" size={20} color={colors.brand} />
              </View>
              <Text style={{ fontWeight: "600", color: colors.ink, fontSize: 13 }}>Email us</Text>
            </Card>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/assistant" as Href)} style={{ flex: 1 }}>
            <Card style={{ alignItems: "center", paddingVertical: 18 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="sparkles" size={20} color={colors.brand} />
              </View>
              <Text style={{ fontWeight: "600", color: colors.ink, fontSize: 13 }}>Ask Jamindar</Text>
            </Card>
          </Pressable>
        </View>

        {/* FAQ */}
        <Text style={{ fontWeight: "600", fontSize: 15, color: colors.ink, marginBottom: space.sm }}>Frequently asked</Text>
        {FAQ.map((f, i) => {
          const isOpen = open === i;
          return (
            <Card key={i} onPress={() => setOpen(isOpen ? null : i)} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ flex: 1, fontWeight: "600", color: colors.ink, fontSize: 14 }}>{f.q}</Text>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.inkFaint} />
              </View>
              {isOpen ? <Text style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{f.a}</Text> : null}
            </Card>
          );
        })}

        <Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 20 }}>
          We're here to help · {SUPPORT_EMAIL}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
