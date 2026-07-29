import { View, Text, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import { Card } from "./ui";
import { openCall, openWhatsApp, openSms, openEmail } from "@/lib/contact";

export interface PromoterContact {
  full_name: string | null;
  mobile: string | null;
  email: string | null;
  whatsapp: string | null;
  designation: string | null;
  avatar_url: string | null;
  partner_status: string | null;
  member_code: string | null;
}

/** Direct-contact card for a promoter — Call / WhatsApp / SMS / Email open the
 *  native apps (numbers never shown as text). In-app chat / live chat / video
 *  are future-ready. Communication always originates from the promoter's
 *  verified profile. */
export function ContactActions({ contact, context }: { contact: PromoterContact; context?: string }) {
  const verified = contact.partner_status === "verified";
  const waNumber = contact.whatsapp || contact.mobile;

  const channels: { icon: string; label: string; on: boolean; run: () => void; tint: string; fg: string }[] = [
    { icon: "call", label: "Call", on: !!contact.mobile, run: () => openCall(contact.mobile), tint: colors.brandSoft, fg: colors.brand },
    { icon: "logo-whatsapp", label: "WhatsApp", on: !!waNumber, run: () => openWhatsApp(waNumber, context), tint: colors.successSoft, fg: "#25D366" },
    { icon: "chatbubble-ellipses", label: "SMS", on: !!contact.mobile, run: () => openSms(contact.mobile, context), tint: "#E8F1FE", fg: "#2B6FE1" },
    { icon: "mail", label: "Email", on: !!contact.email, run: () => openEmail(contact.email, "Enquiry via Jamin Properties", context), tint: colors.goldSoft, fg: colors.goldDark },
  ];
  const enabled = channels.filter((c) => c.on);
  const future = [
    { icon: "chatbubbles", label: "In-app chat" },
    { icon: "headset", label: "Live chat" },
    { icon: "videocam", label: "Video call" },
  ];

  return (
    <Card style={{ marginTop: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {contact.avatar_url ? (
            <Image source={{ uri: contact.avatar_url }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>{initials(contact.full_name)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.body.fontSize }} numberOfLines={1}>
            {contact.full_name ?? "Your Jamin partner"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
            {verified ? <Ionicons name="ribbon" size={12} color={colors.goldDark} /> : null}
            <Text style={{ color: verified ? colors.goldDark : colors.inkFaint, fontSize: T.caption.fontSize + 1, fontWeight: verified ? "700" : "400" }} numberOfLines={1}>
              {verified ? "Verified Jamin Bazaar Partner" : contact.designation || "Jamin Partner"}
            </Text>
          </View>
        </View>
      </View>

      {enabled.length ? (
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
          {enabled.map((c) => (
            <Pressable key={c.label} onPress={c.run} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={c.icon as any} size={22} color={c.fg} />
              </View>
              <Text style={{ fontSize: T.caption.fontSize + 1, color: colors.inkSoft, fontWeight: "600" }}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, marginTop: space.sm }}>
          Contact details are being set up for this partner.
        </Text>
      )}

      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md, opacity: 0.55 }}>
        {future.map((f) => (
          <View key={f.label} style={{ flex: 1, alignItems: "center", gap: 5 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={f.icon as any} size={18} color={colors.inkFaint} />
            </View>
            <Text style={{ fontSize: T.caption.fontSize, color: colors.inkFaint }}>{f.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize, textAlign: "center", marginTop: space.xs }}>
        In-app messaging, live chat &amp; video calling — coming soon.
      </Text>
    </Card>
  );
}

/** Self-contained: fetches a promoter's verified contact by id and renders the
 *  contact card. Renders nothing if there's no promoter or no contact. */
export function PromoterContactBlock({ promoterId, context }: { promoterId?: string | null; context?: string }) {
  const { data } = useQuery({
    queryKey: ["promoter-contact", promoterId],
    enabled: !!promoterId,
    queryFn: async (): Promise<PromoterContact | null> => {
      const [{ data: p }, { data: pp }] = await Promise.all([
        supabase.from("profiles").select("full_name,mobile,email,partner_status,member_code,avatar_url").eq("id", promoterId!).maybeSingle(),
        supabase.from("promoter_profiles").select("whatsapp,designation").eq("id", promoterId!).maybeSingle(),
      ]);
      if (!p) return null;
      return { ...(p as any), whatsapp: (pp as any)?.whatsapp ?? null, designation: (pp as any)?.designation ?? null };
    },
  });
  if (!promoterId || !data) return null;
  return <ContactActions contact={data} context={context} />;
}
