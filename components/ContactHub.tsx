import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, Image, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, space, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import {
  useResolvedContact,
  openChannel,
  requestCallback,
  ROUTING_NOTE,
  type Channel,
  type ResolvedContact,
} from "@/lib/comms";
import { openThreadWith } from "@/lib/messaging";

type ChannelDef = {
  key: Channel | "callback";
  label: string;
  hint: string;
  icon: string;
  tint: string;
  fg: string;
  available: (c: ResolvedContact) => boolean;
  /** Hidden entirely (rather than greyed) when this contact can't use it. */
  show?: (c: ResolvedContact) => boolean;
  /** Why it's unavailable, when that needs explaining. */
  unavailable?: (c: ResolvedContact) => string;
};

const CHANNELS: ChannelDef[] = [
  {
    key: "phone",
    label: "Phone call",
    hint: "Opens your dialer",
    icon: "call",
    tint: colors.brandSoft,
    fg: colors.brand,
    available: (c) => !!c.mobile,
  },
  {
    key: "whatsapp_call",
    label: "WhatsApp call",
    hint: "Opens the chat — tap the call icon",
    icon: "videocam",
    tint: colors.successSoft,
    fg: "#25D366",
    available: (c) => !!(c.whatsapp || c.mobile),
  },
  {
    key: "whatsapp_message",
    label: "WhatsApp message",
    hint: "Message on WhatsApp",
    icon: "logo-whatsapp",
    tint: colors.successSoft,
    fg: "#25D366",
    available: (c) => !!(c.whatsapp || c.mobile),
  },
  {
    key: "sms",
    label: "SMS",
    hint: "Text message",
    icon: "chatbubble-ellipses",
    tint: "#E8F1FE",
    fg: "#2B6FE1",
    available: (c) => !!c.mobile,
    // The Jamin desk answers calls, WhatsApp and email — not SMS. Hide it there
    // so texts don't disappear into a number nobody watches.
    show: (c) => c.kind !== "desk",
  },
  {
    key: "in_app_chat",
    label: "In-app chat",
    hint: "Secure, stays inside Jamin",
    icon: "chatbubbles",
    tint: "#ECEEFB",
    fg: "#4B57C9",
    available: (c) => !!c.id,
    unavailable: (c) =>
      c.kind === "desk" ? "Use WhatsApp or email to reach the desk" : "Not available for this contact",
  },
  {
    key: "email",
    label: "Email",
    hint: "Opens your mail app",
    icon: "mail",
    tint: colors.goldSoft,
    fg: colors.goldDark,
    available: (c) => !!c.email,
  },
  {
    key: "callback",
    label: "Request a callback",
    hint: "We call you back",
    icon: "call-outline",
    tint: colors.surfaceSunken,
    fg: colors.inkSoft,
    available: () => true,
  },
];

/**
 * Every way to reach the right person for this property / visit / lead.
 * Which channels appear is decided by the server-side routing rules, so the
 * same sheet works for buyers, promoters and admins.
 */
export function ContactHubSheet({
  visible,
  onClose,
  propertyId,
  counterpartId,
  visitId,
  leadId,
  context,
}: {
  visible: boolean;
  onClose: () => void;
  propertyId?: string | null;
  counterpartId?: string | null;
  visitId?: string | null;
  leadId?: string | null;
  context?: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: contact, isLoading } = useResolvedContact(propertyId, counterpartId, visible);
  const [busy, setBusy] = useState<string | null>(null);

  const ctx = { propertyId, visitId, leadId, message: context };

  async function run(def: ChannelDef) {
    if (!contact) return;
    setBusy(def.key);
    try {
      if (def.key === "callback") {
        await requestCallback(contact, ctx);
        onClose();
        Alert.alert("Callback requested", "A Jamin advisor will call you shortly. Namaste 🙏");
        return;
      }
      if (def.key === "in_app_chat") {
        if (!contact.id) return;
        const threadId = await openThreadWith(contact.id, { propertyId, visitId });
        onClose();
        router.push(`/messages/${threadId}` as Href);
        return;
      }
      const ok = await openChannel(def.key as Channel, contact, ctx);
      if (!ok) {
        Alert.alert(
          "Couldn't open " + def.label.toLowerCase(),
          "That app doesn't seem to be available on this device."
        );
      } else {
        onClose();
      }
    } catch (e: any) {
      Alert.alert("Something went wrong", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const verified = contact?.partner_status === "verified";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "88%",
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 }}>
            <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 }}>
              Contact
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 15 }}>Close</Text>
            </Pressable>
          </View>

          {isLoading || !contact ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
              {/* who you're reaching */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: colors.brand,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {contact.avatar_url ? (
                    <Image source={{ uri: contact.avatar_url }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 19 }}>{initials(contact.full_name)}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.body.fontSize }} numberOfLines={1}>
                    {contact.full_name ?? "Your Jamin partner"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                    {verified ? <Ionicons name="ribbon" size={12} color={colors.goldDark} /> : null}
                    <Text
                      style={{
                        color: verified ? colors.goldDark : colors.inkFaint,
                        fontSize: T.caption.fontSize + 2,
                        fontWeight: verified ? "700" : "400",
                      }}
                      numberOfLines={1}
                    >
                      {verified ? "Verified Jamin Partner" : contact.designation || "Jamin Properties"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* why you're reaching them (routing transparency) */}
              {ROUTING_NOTE[contact.reason] ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: contact.routed ? colors.goldSoft : colors.brandSoft,
                  }}
                >
                  <Ionicons
                    name="shield-checkmark"
                    size={15}
                    color={contact.routed ? colors.goldDark : colors.brand}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: contact.routed ? colors.goldDark : colors.brand,
                      fontSize: 12.5,
                      fontWeight: "600",
                    }}
                  >
                    {ROUTING_NOTE[contact.reason]}
                  </Text>
                </View>
              ) : null}

              {/* channels */}
              <View style={{ marginTop: 16, gap: 10 }}>
                {CHANNELS.filter((def) => def.show?.(contact) ?? true).map((def) => {
                  const on = def.available(contact);
                  const working = busy === def.key;
                  return (
                    <Pressable
                      key={def.key}
                      disabled={!on || !!busy}
                      onPress={() => run(def)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                        paddingHorizontal: 14,
                        paddingVertical: 13,
                        borderRadius: 16,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        opacity: on ? 1 : 0.45,
                      }}
                    >
                      <View
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 13,
                          backgroundColor: def.tint,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name={def.icon as any} size={20} color={def.fg} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 14.5 }}>{def.label}</Text>
                        <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                          {on ? def.hint : def.unavailable?.(contact) ?? "Not available for this contact"}
                        </Text>
                      </View>
                      {working ? (
                        <ActivityIndicator color={colors.brand} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18 }}>
                Every conversation is logged for your protection. Jamin never shares
                your number without routing it through your assigned partner.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * The partner card shown on a property page. Uses `resolve_contact`, so it
 * works for buyers — a direct `profiles` read would be blocked by RLS.
 */
export function PartnerContactCard({ propertyId, context }: { propertyId?: string | null; context?: string }) {
  const { data: contact } = useResolvedContact(propertyId, null);
  const [open, setOpen] = useState(false);
  if (!contact) return null;
  const verified = contact.partner_status === "verified";

  return (
    <>
      <View
        style={{
          marginTop: space.md,
          padding: 16,
          borderRadius: space.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {contact.avatar_url ? (
              <Image source={{ uri: contact.avatar_url }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>{initials(contact.full_name)}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.body.fontSize }} numberOfLines={1}>
              {contact.full_name ?? "Your Jamin partner"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
              {verified ? <Ionicons name="ribbon" size={12} color={colors.goldDark} /> : null}
              <Text
                style={{
                  color: verified ? colors.goldDark : colors.inkFaint,
                  fontSize: T.caption.fontSize + 2,
                  fontWeight: verified ? "700" : "400",
                }}
                numberOfLines={1}
              >
                {verified ? "Verified Jamin Partner" : contact.designation || "Jamin Properties"}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => setOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 14,
            paddingVertical: 13,
            borderRadius: space.sm + 3,
            borderWidth: 1.5,
            borderColor: colors.brand,
            backgroundColor: colors.brandSoft,
          }}
        >
          <Ionicons name="chatbubbles" size={18} color={colors.brand} />
          <Text style={{ color: colors.brand, fontWeight: "700" }}>Contact — call, WhatsApp, SMS or chat</Text>
        </Pressable>
      </View>

      <ContactHubSheet
        visible={open}
        onClose={() => setOpen(false)}
        propertyId={propertyId}
        context={context}
      />
    </>
  );
}

/** Inline "Contact" button that opens the hub — drop it on any screen. */
export function ContactButton({
  propertyId,
  counterpartId,
  context,
  label = "Contact",
  style,
}: {
  propertyId?: string | null;
  counterpartId?: string | null;
  context?: string;
  label?: string;
  style?: object;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 14,
            borderRadius: space.sm + 3,
            borderWidth: 1.5,
            borderColor: colors.brand,
            backgroundColor: colors.brandSoft,
          },
          style,
        ]}
      >
        <Ionicons name="chatbubbles" size={18} color={colors.brand} />
        <Text style={{ color: colors.brand, fontWeight: "700" }}>{label}</Text>
      </Pressable>
      <ContactHubSheet
        visible={open}
        onClose={() => setOpen(false)}
        propertyId={propertyId}
        counterpartId={counterpartId}
        context={context}
      />
    </>
  );
}
