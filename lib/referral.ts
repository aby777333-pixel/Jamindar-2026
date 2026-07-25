// Buyer-module referral centre (migrations 0006/0011) — client helpers.
import { Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "./supabase";

// Public landing that captures ?ref=<code> for acquisition (deep-link wiring TODO).
const REFERRAL_BASE = "https://merry-begonia-4c3cd1.netlify.app/welcome";

export function referralLink(code: string): string {
  return `${REFERRAL_BASE}?ref=${encodeURIComponent(code)}`;
}

export function referralMessage(code: string): string {
  return `Join me on Jamin Properties — discover verified plots & land with confidence. Use my invite code ${code}: ${referralLink(code)}`;
}

export function qrUrl(code: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(referralLink(code))}`;
}

export type ReferralStats = {
  registrations: number; kyc_completed: number; clicks: number; downloads: number;
  enquiries: number; site_visits: number; purchases: number; rewards: number;
};

export async function fetchReferralStats(): Promise<ReferralStats> {
  const { data } = await supabase.rpc("my_referral_stats");
  const d = (data ?? {}) as Partial<ReferralStats>;
  return {
    registrations: d.registrations ?? 0, kyc_completed: d.kyc_completed ?? 0,
    clicks: d.clicks ?? 0, downloads: d.downloads ?? 0, enquiries: d.enquiries ?? 0,
    site_visits: d.site_visits ?? 0, purchases: d.purchases ?? 0, rewards: d.rewards ?? 0,
  };
}

export async function requestPartner(): Promise<void> {
  const { error } = await supabase.rpc("request_partner");
  if (error) throw error;
}

const open = (url: string) => Linking.openURL(url).catch(() => {});

export type ShareChannel = "whatsapp" | "telegram" | "sms" | "email" | "facebook" | "x" | "instagram" | "copy" | "more";

/** Share the referral invite through a specific channel. Returns a toast-worthy note or null. */
export async function shareReferral(channel: ShareChannel, code: string): Promise<string | null> {
  const link = referralLink(code);
  const text = referralMessage(code);
  const e = encodeURIComponent;
  switch (channel) {
    case "whatsapp": open(`https://wa.me/?text=${e(text)}`); return null;
    case "telegram": open(`https://t.me/share/url?url=${e(link)}&text=${e(text)}`); return null;
    case "sms": open(Platform.OS === "ios" ? `sms:&body=${e(text)}` : `sms:?body=${e(text)}`); return null;
    case "email": open(`mailto:?subject=${e("Join Jamin Properties")}&body=${e(text)}`); return null;
    case "facebook": open(`https://www.facebook.com/sharer/sharer.php?u=${e(link)}`); return null;
    case "x": open(`https://twitter.com/intent/tweet?text=${e(text)}`); return null;
    case "copy": await Clipboard.setStringAsync(link); return "Invite link copied";
    case "instagram":
    case "more":
    default:
      await Share.share({ message: text });
      return null;
  }
}

/** Deep link to a property, carrying the sharer's referral code when present
 *  so the lead is attributed back to them. */
export function propertyLink(propertyId: string, refCode?: string | null): string {
  const parts = [`p=${encodeURIComponent(propertyId)}`];
  if (refCode) parts.push(`ref=${encodeURIComponent(refCode)}`);
  return `${REFERRAL_BASE}?${parts.join("&")}`;
}

export interface PromoterCard {
  name?: string | null;
  promoterId?: string | null;   // partner_code, e.g. JA-P-0001
  designation?: string | null;
  mobile?: string | null;
  verified?: boolean;
}

/**
 * Share text for a property.
 *
 * A plain buyer sends the listing. A verified promoter sends the listing plus
 * their digital-card details and referral link, so whoever opens it knows who
 * sent it and the lead is attributed back to them.
 */
export function propertyShareMessage(
  property: { id: string; title: string; price?: string | null; location?: string | null; highlights?: string[] },
  promoter?: PromoterCard | null
): string {
  const lines: string[] = ["🏡 " + property.title];
  if (property.price) lines.push(property.price);
  if (property.location) lines.push("📍 " + property.location);
  if (property.highlights?.length) {
    lines.push("", ...property.highlights.slice(0, 4).map((h) => "• " + h));
  }

  const ref = promoter?.verified ? promoter.promoterId ?? null : null;
  lines.push("", propertyLink(property.id, ref));

  if (promoter?.verified && promoter.name) {
    lines.push(
      "",
      "— — —",
      `${promoter.name}${promoter.designation ? ` · ${promoter.designation}` : ""}`,
      "Verified Jamin Partner" + (promoter.promoterId ? ` · ${promoter.promoterId}` : ""),
    );
    if (promoter.mobile) lines.push(`📞 +${promoter.mobile.replace(/^\+/, "")}`);
  }

  lines.push("", "JAMIN PROPERTIES · Signature for Fortune");
  return lines.join("\n");
}
