import { useState } from "react";
import { Text, View, ScrollView, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { openCall, openWhatsApp, openSms, openEmail } from "@/lib/contact";
import { colors, space, type as T } from "@/lib/theme";

const SUPPORT_EMAIL = "info@jaminproperties.com";

interface DeskContact {
  label: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
}

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

  // The admin-configured help desk (platform_contacts.jamin_desk) — the same
  // record the Admin Console edits, so changes are live here immediately.
  const { data: desk } = useQuery({
    queryKey: ["desk-contact-public"],
    queryFn: async (): Promise<DeskContact | null> => {
      const { data } = await supabase
        .from("platform_contacts")
        .select("label, mobile, whatsapp, email")
        .eq("id", "jamin_desk")
        .maybeSingle();
      return (data as DeskContact) ?? null;
    },
  });

  const deskEmail = desk?.email || SUPPORT_EMAIL;
  const deskActions: { icon: keyof typeof Ionicons.glyphMap; label: string; show: boolean; onPress: () => void }[] = [
    { icon: "call", label: "Call", show: !!desk?.mobile, onPress: () => openCall(desk?.mobile) },
    { icon: "logo-whatsapp", label: "WhatsApp", show: !!(desk?.whatsapp || desk?.mobile), onPress: () => openWhatsApp(desk?.whatsapp || desk?.mobile, "Hi, I need help with Jamin Bazaar.") },
    { icon: "chatbox", label: "SMS", show: !!desk?.mobile, onPress: () => openSms(desk?.mobile, "Hi, I need help with Jamin Bazaar.") },
    { icon: "mail", label: "Email", show: !!deskEmail, onPress: () => openEmail(deskEmail, "Jamin Bazaar — Support") },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Support</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* help desk — every channel opens the native app (dialer/WhatsApp/SMS/mail) */}
        <Card style={{ marginBottom: space.md, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="headset" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 15 }}>{desk?.label || "Jamin Bazaar Help Desk"}</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 1 }}>We usually respond within working hours.</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {deskActions.filter((a) => a.show).map((a) => (
              <Pressable key={a.label} onPress={a.onPress} style={{ flex: 1, alignItems: "center", gap: 5, backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 12 }}>
                <Ionicons name={a.icon} size={18} color={colors.brand} />
                <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 11.5 }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Pressable onPress={() => router.navigate("/(tabs)/assistant" as Href)}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: space.md }}>
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", color: colors.ink, fontSize: 14 }}>Ask Jamindar</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 1 }}>Instant answers by voice or text, in your language</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Card>
        </Pressable>

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

        <Pressable onPress={() => openEmail(deskEmail, "Jamin Bazaar — Support")}>
          <Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 20 }}>
            We're here to help · <Text style={{ color: colors.brand }}>{deskEmail}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
