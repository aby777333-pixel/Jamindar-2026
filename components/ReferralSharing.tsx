import { useState } from "react";
import { Text, View, Pressable, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, SectionTitle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space } from "@/lib/theme";
import {
  referralLink,
  teamInviteMessage,
  propertyLink,
  propertyShareMessage,
  shareVia,
  type ShareChannel,
} from "@/lib/referral";
import { formatINR } from "@/lib/format";
import type { Property } from "@/lib/types";

const CHANNELS: { icon: string; label: string; ch: ShareChannel; fg: string; bg: string }[] = [
  { icon: "copy", label: "Copy Link", ch: "copy", fg: colors.inkSoft, bg: colors.surfaceSunken },
  { icon: "logo-whatsapp", label: "WhatsApp", ch: "whatsapp", fg: colors.success, bg: colors.successSoft },
  { icon: "logo-facebook", label: "Facebook", ch: "facebook", fg: "#2B6FE1", bg: "#E8F1FE" },
  { icon: "paper-plane", label: "Telegram", ch: "telegram", fg: "#2AA5DA", bg: "#E5F4FB" },
  { icon: "mail", label: "Email", ch: "email", fg: colors.goldDark, bg: colors.goldSoft },
  { icon: "ellipsis-horizontal", label: "More", ch: "more", fg: colors.inkSoft, bg: colors.surfaceSunken },
];

/** Referral Sharing (report 28-07) — two ways for a promoter to share:
 *  1. Build Your Team — their normal referral link.
 *  2. Promote Your Project — pick a live project; the link opens that
 *     project's details page, carrying the promoter's referral code. */
export function ReferralSharing() {
  const { profile } = useAuth();
  const code = profile?.referral_code ?? profile?.member_code ?? "";
  const [selected, setSelected] = useState<Property | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["referral-share-projects"],
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .in("status", ["available", "reserved"])
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      return (data as Property[]) ?? [];
    },
  });

  async function shareTeam(ch: ShareChannel) {
    if (!code) return;
    const note = await shareVia(ch, teamInviteMessage(code), referralLink(code), "Join my Jamin team");
    if (note) Alert.alert("Done", note);
  }

  async function shareProject(ch: ShareChannel) {
    if (!selected || !code) return;
    const link = propertyLink(selected.id, code);
    const text = propertyShareMessage(
      {
        id: selected.id,
        title: selected.title,
        price: selected.price ? formatINR(selected.price) : null,
        location: [selected.locality, selected.city].filter(Boolean).join(", ") || null,
      },
      {
        name: profile?.full_name,
        promoterId: profile?.partner_code,
        refCode: code,
        mobile: profile?.mobile,
        whatsapp: profile?.mobile,
        email: profile?.email,
        verified: profile?.partner_status === "verified",
      }
    );
    const note = await shareVia(ch, text, link, selected.title);
    if (note) Alert.alert("Done", note);
  }

  const channelRow = (onShare: (ch: ShareChannel) => void, disabled = false) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {CHANNELS.map((c) => (
        <Pressable
          key={c.ch}
          disabled={disabled}
          onPress={() => onShare(c.ch)}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: disabled ? colors.surfaceSunken : c.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}
        >
          <Ionicons name={c.icon as any} size={14} color={disabled ? colors.inkFaint : c.fg} />
          <Text style={{ color: disabled ? colors.inkFaint : c.fg, fontWeight: "700", fontSize: 12 }}>{c.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (!code) return null;

  return (
    <View>
      <SectionTitle>Referral Sharing</SectionTitle>

      {/* Option 1 — Build Your Team */}
      <Card style={{ gap: 10, marginBottom: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="people" size={18} color={colors.goldDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 14.5 }}>Build Your Team</Text>
            <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Invite new promoters with your referral link</Text>
          </View>
        </View>
        <Text style={{ color: colors.inkSoft, fontSize: 12, backgroundColor: colors.surfaceSunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }} numberOfLines={1}>
          {referralLink(code)}
        </Text>
        {channelRow(shareTeam)}
      </Card>

      {/* Option 2 — Promote Your Project */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="business" size={18} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 14.5 }}>Promote Your Project</Text>
            <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Pick a project — the link opens its details page</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(projects ?? []).map((p) => {
            const on = selected?.id === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setSelected(on ? null : p)}
                style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.brand : colors.surfaceSunken, borderWidth: 1, borderColor: on ? colors.brand : colors.border }}
              >
                <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: 12 }} numberOfLines={1}>
                  {p.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {selected ? (
          <Text style={{ color: colors.inkSoft, fontSize: 12, backgroundColor: colors.surfaceSunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }} numberOfLines={1}>
            {propertyLink(selected.id, code)}
          </Text>
        ) : (
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Select a project above to generate its share link.</Text>
        )}
        {channelRow(shareProject, !selected)}
      </Card>
    </View>
  );
}
