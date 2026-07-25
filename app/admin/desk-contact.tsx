import { useEffect, useState } from "react";
import { Text, View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, Button, Card, Loading, Empty } from "@/components/ui";
import { Field } from "@/components/Field";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

interface DeskContact {
  id: string;
  label: string;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  is_active: boolean;
  updated_at: string;
}

/**
 * The Jamin help desk's own contact details — what every buyer and promoter
 * reaches when no partner is assigned. Editable here so the numbers are never
 * hardcoded in the app; RLS restricts writes to super admins.
 */
export default function DeskContact() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "super_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["desk-contact"],
    enabled: isAdmin,
    queryFn: async (): Promise<DeskContact | null> => {
      const { data } = await supabase.from("platform_contacts").select("*").eq("id", "jamin_desk").maybeSingle();
      return (data as DeskContact) ?? null;
    },
  });

  const [label, setLabel] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setLabel(data.label ?? "");
    setMobile(data.mobile ?? "");
    setWhatsapp(data.whatsapp ?? "");
    setEmail(data.email ?? "");
  }, [data?.id, data?.updated_at]);

  async function onSave() {
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      Alert.alert("Check email", "Please enter a valid email address.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_contacts")
        .update({
          label: label.trim() || "Jamin Properties Help Desk",
          mobile: mobile.trim() || null,
          whatsapp: whatsapp.trim() || mobile.trim() || null,
          email: email.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "jamin_desk");
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["desk-contact"] });
      qc.invalidateQueries({ queryKey: ["resolve-contact"] });
      Alert.alert("Saved", "The help desk details are live across the app immediately.");
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <Screen scroll={false}>
        <Empty title="Admins only" subtitle="This console is restricted to Jamin administrators." />
      </Screen>
    );
  }
  if (isLoading) return <Loading />;

  return (
    <Screen>
      <View style={{ paddingTop: space.md }}>
        <Text style={{ fontSize: T.title.fontSize - 4, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 }}>
          Help desk contact
        </Text>
        <Text style={{ color: colors.inkFaint, marginTop: 4, marginBottom: space.md, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight }}>
          Shown to any buyer or promoter who has no assigned partner. Leave a field blank to hide that channel.
        </Text>

        <Card style={{ flexDirection: "row", gap: space.xs, marginBottom: space.md, backgroundColor: colors.brandSoft, borderColor: colors.brandSoft }}>
          <Ionicons name="information-circle" size={16} color={colors.brand} />
          <Text style={{ flex: 1, color: colors.brand, fontSize: T.caption.fontSize + 2, lineHeight: 17 }}>
            Include the country code with a leading + (e.g. +919384818895) so calls dial correctly from any device.
          </Text>
        </Card>

        <Field label="Desk name" value={label} onChangeText={setLabel} placeholder="Jamin Properties Help Desk" />
        <Field
          label="Phone (calls)"
          value={mobile}
          onChangeText={setMobile}
          placeholder="+919384818895"
          keyboardType="phone-pad"
        />
        <Field
          label="WhatsApp"
          value={whatsapp}
          onChangeText={setWhatsapp}
          placeholder="Same as phone if left blank"
          keyboardType="phone-pad"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="info@jaminproperties.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Button label="Save" onPress={onSave} loading={saving} style={{ marginTop: space.xs }} />
        <Button label="Back" variant="outline" onPress={() => router.back()} style={{ marginTop: space.xs }} />
      </View>
    </Screen>
  );
}
