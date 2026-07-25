// Communication hub (migration 0021).
//
// The app never reads another person's profile row directly — profiles RLS
// hides it. `resolve_contact` is the single server-side entry point: it applies
// Jamin's routing rules (a buyer reaches their assigned promoter, never a
// seller; a promoter reaches only their own clients; anything unroutable falls
// back to the Jamin desk) and returns just the fields needed to open a channel.
//
// Every attempt is recorded via `log_communication`, which also writes the
// audit spine.
import { Linking, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type Channel =
  | "phone"
  | "whatsapp_call"
  | "whatsapp_message"
  | "sms"
  | "email"
  | "in_app_chat"
  | "callback_request";

export interface ResolvedContact {
  kind: "person" | "desk";
  id: string | null;
  full_name: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
  designation: string | null;
  partner_status: string | null;
  member_code: string | null;
  /** true when the request was redirected (e.g. buyer → assigned partner). */
  routed: boolean;
  reason: string;
}

export const ROUTING_NOTE: Record<string, string> = {
  assigned_promoter: "Connected to your assigned Jamin partner.",
  routed_via_partner: "For your protection, Jamin routes this through your assigned partner.",
  admin_direct: "Admin access — direct contact.",
  own_client: "Your client.",
  own_visit_client: "Your site-visit client.",
  own_lead: "Your lead.",
  not_your_client: "This person isn't assigned to you — the Jamin desk will help.",
  jamin_desk: "Connected to the Jamin help desk.",
};

/** Resolve who the signed-in user may contact for this property / counterpart. */
export function useResolvedContact(propertyId?: string | null, counterpartId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["resolve-contact", propertyId ?? null, counterpartId ?? null],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ResolvedContact | null> => {
      const { data, error } = await supabase.rpc("resolve_contact", {
        p_property_id: propertyId ?? null,
        p_counterpart: counterpartId ?? null,
      });
      if (error) throw error;
      return (data as ResolvedContact) ?? null;
    },
  });
}

export interface CommContext {
  propertyId?: string | null;
  visitId?: string | null;
  leadId?: string | null;
  message?: string;
}

/** Record a contact attempt. Fire-and-forget: logging must never block a call. */
export async function logComm(
  channel: Channel,
  contact: Pick<ResolvedContact, "id" | "routed" | "reason"> | null,
  ctx: CommContext = {},
  status: "initiated" | "delivered" | "failed" = "initiated"
): Promise<void> {
  try {
    await supabase.rpc("log_communication", {
      p_channel: channel,
      p_recipient_id: contact?.id ?? null,
      p_property_id: ctx.propertyId ?? null,
      p_visit_id: ctx.visitId ?? null,
      p_lead_id: ctx.leadId ?? null,
      p_routed_via: contact?.routed ? contact?.id ?? null : null,
      p_routing_reason: contact?.reason ?? null,
      p_status: status,
      p_meta: {},
    });
  } catch {
    /* telemetry must never break a user flow */
  }
}

const digits = (p?: string | null) => (p ?? "").replace(/[^\d+]/g, "");
const intl = (p?: string | null) => digits(p).replace(/^\+/, "");

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a channel natively and log the attempt.
 * Returns false when the channel could not be opened (no number, app missing).
 */
export async function openChannel(
  channel: Channel,
  contact: ResolvedContact,
  ctx: CommContext = {}
): Promise<boolean> {
  const phone = digits(contact.mobile);
  const wa = intl(contact.whatsapp ?? contact.mobile);
  const text = ctx.message ?? "";
  let ok = false;

  switch (channel) {
    case "phone":
      ok = !!phone && (await open(`tel:${phone}`));
      break;
    case "sms": {
      if (!phone) break;
      const sep = Platform.OS === "ios" ? "&" : "?";
      ok = await open(text ? `sms:${phone}${sep}body=${encodeURIComponent(text)}` : `sms:${phone}`);
      break;
    }
    case "whatsapp_message":
      ok = !!wa && (await open(`https://wa.me/${wa}${text ? `?text=${encodeURIComponent(text)}` : ""}`));
      break;
    case "whatsapp_call":
      // WhatsApp exposes no public "start call" deep link — open the contact's
      // thread so the user taps the call button there (the UI says so).
      ok = !!wa && (await open(`https://wa.me/${wa}`));
      break;
    case "email":
      ok =
        !!contact.email &&
        (await open(
          `mailto:${contact.email}?subject=${encodeURIComponent("Enquiry via Jamin Properties")}${
            text ? `&body=${encodeURIComponent(text)}` : ""
          }`
        ));
      break;
    default:
      ok = false;
  }

  await logComm(channel, contact, ctx, ok ? "initiated" : "failed");
  return ok;
}

/** Ask the desk to call back — no number needed on the buyer's side. */
export async function requestCallback(
  contact: ResolvedContact | null,
  ctx: CommContext = {}
): Promise<void> {
  const { error } = await supabase.from("leads").insert({
    buyer_id: (await supabase.auth.getUser()).data.user?.id,
    promoter_id: contact?.id ?? null,
    property_id: ctx.propertyId ?? null,
    source: "callback_request",
    status: "new",
  });
  await logComm("callback_request", contact, ctx, error ? "failed" : "initiated");
  if (error) throw error;
}
