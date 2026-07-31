// Buyer-module referral centre (migrations 0006/0011) — client helpers.
import { Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "./supabase";


export function referralLink(code: string): string {
  // Branded invite page (server-rendered OG preview with the promoter's card,
  // verified badge, QR and projects). Old /welcome?ref= links 301 here too.
  return `https://merry-begonia-4c3cd1.netlify.app/i/${encodeURIComponent(code)}`;
}

export function referralMessage(code: string): string {
  return `Join me on Jamin Bazaar — discover verified plots & land with confidence. Use my invite code ${code}: ${referralLink(code)}`;
}

/** Promoter "Build your team" invite — recruit teammates, not just buyers. */
export function teamInviteMessage(code: string): string {
  return `I'm building my team on Jamin Bazaar — join me, become a promoter and earn commissions on verified plots & land. Use my invite code ${code} when you sign up: ${referralLink(code)}`;
}

/** Public premium V-Card page for a promoter (partner code preferred). */
export function cardLink(code: string): string {
  return `https://merry-begonia-4c3cd1.netlify.app/card?c=${encodeURIComponent(code)}`;
}

export function cardMessage(name: string | null | undefined, code: string): string {
  return `${name ?? "Your Jamin Partner"} · Jamin Bazaar\nView my digital card — live projects, one-tap contact and site-visit booking: ${cardLink(code)}`;
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

/** Share ANY text+link through a specific channel (report 28-07: referral
 *  sharing supports WhatsApp, Facebook, Telegram, Email, copy…). */
export async function shareVia(
  channel: ShareChannel,
  text: string,
  link: string,
  subject = "Join Jamin Bazaar"
): Promise<string | null> {
  const e = encodeURIComponent;
  switch (channel) {
    case "whatsapp": open(`https://wa.me/?text=${e(text)}`); return null;
    case "telegram": open(`https://t.me/share/url?url=${e(link)}&text=${e(text)}`); return null;
    case "sms": open(Platform.OS === "ios" ? `sms:&body=${e(text)}` : `sms:?body=${e(text)}`); return null;
    case "email": open(`mailto:?subject=${e(subject)}&body=${e(text)}`); return null;
    case "facebook": open(`https://www.facebook.com/sharer/sharer.php?u=${e(link)}`); return null;
    case "x": open(`https://twitter.com/intent/tweet?text=${e(text)}`); return null;
    case "copy": await Clipboard.setStringAsync(link); return "Link copied";
    case "instagram": {
      // Instagram is a dedicated button, so it must open Instagram — it used to
      // fall through to the system share sheet, making the user pick the app
      // again (owner bug report).
      //
      // Instagram exposes no URL scheme that accepts prefilled text: stories
      // and DMs can only be pre-populated through their SDK with an image
      // asset. So do the honest best thing — put the invite on the clipboard,
      // open the app, and tell the user it is ready to paste.
      // ⚠️ Deliberately NOT canOpenURL(). Since Android 11 that returns false
      // for any scheme missing from the manifest's <queries>, which here lists
      // only https — so an installed Instagram would still look absent and
      // every user would land on the fallback. Attempting the open and
      // catching the rejection is accurate on both platforms.
      await Clipboard.setStringAsync(text);
      try {
        await Linking.openURL("instagram://app");
        return "Invite copied — paste it into your story, post or DM";
      } catch {
        // Not installed: the report asks for a message or the sheet as fallback.
        await Share.share({ message: text });
        return "Instagram isn't installed — choose another app";
      }
    }
    case "more":
    default:
      await Share.share({ message: text });
      return null;
  }
}

/** Share the referral invite through a specific channel. Returns a toast-worthy note or null. */
export async function shareReferral(channel: ShareChannel, code: string): Promise<string | null> {
  const note = await shareVia(channel, referralMessage(code), referralLink(code));
  return note === "Link copied" ? "Invite link copied" : note;
}

/** Branded share page for a property (server-rendered OG preview: hero image,
 *  project details, promoter card + verified badge, CTAs, QR). Carries the
 *  sharer's referral code so every enquiry/download is attributed back to them. */
export function propertyLink(propertyId: string, refCode?: string | null): string {
  const base = `https://merry-begonia-4c3cd1.netlify.app/s/${encodeURIComponent(propertyId)}`;
  return refCode ? `${base}?ref=${encodeURIComponent(refCode)}` : base;
}

/**
 * Share text for a brochure.
 *
 * ⚠️ Do NOT share `property.brochure_url` directly. That is the raw Supabase
 * storage PDF: WhatsApp cannot render a preview for a PDF, so the message
 * arrived as a bare blue link with no picture (owner report, 2026-07-31).
 * The branded /s/ page carries og:title and og:image, previews richly, and
 * links the brochure itself — so the document is still one tap away.
 */
export function brochureShareMessage(
  label: string,
  property: { id: string; title?: string | null },
  refCode?: string | null,
): string {
  const name = property.title ?? "Jamin Bazaar";
  return `${label} — ${name}\n\nView the project, photos and brochure:\n${propertyLink(property.id, refCode)}`;
}

/** Public Community post page (§9). Anyone can open it without the app; the
 *  ref rides along so the resulting visitor, lead and enquiry are attributed
 *  back to whoever shared it. */
export function communityPostLink(postId: string, refCode?: string | null): string {
  const base = `https://merry-begonia-4c3cd1.netlify.app/c/${encodeURIComponent(postId)}`;
  return refCode ? `${base}?ref=${encodeURIComponent(refCode)}` : base;
}

/** Share text for a Community post — the first line of the post as the hook,
 *  then the public link. Kept short so WhatsApp shows the preview, not a wall. */
export function communityShareMessage(body: string | null | undefined, postId: string, refCode?: string | null): string {
  const first = String(body ?? "").trim().split("\n")[0].trim();
  const hook = first ? (first.length > 120 ? first.slice(0, 117) + "…" : first) : "A discussion on Jamin Community";
  return `${hook}\n\nRead it and join the conversation on Jamin Bazaar:\n${communityPostLink(postId, refCode)}`;
}

/** Personalized brochure PDF for a property, stamped with the promoter's
 *  contact page when the ref belongs to a verified partner. */
export function brochureLink(propertyId: string, refCode?: string | null, src = "app"): string {
  const base = `https://merry-begonia-4c3cd1.netlify.app/b/${encodeURIComponent(propertyId)}`;
  const parts = [refCode ? `ref=${encodeURIComponent(refCode)}` : null, `src=${encodeURIComponent(src)}`].filter(Boolean);
  return `${base}?${parts.join("&")}`;
}

export interface PromoterCard {
  name?: string | null;
  promoterId?: string | null;   // partner_code, e.g. JA-P-0001
  refCode?: string | null;      // referral_code, e.g. JA-REF-00001 — drives attribution
  designation?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  verified?: boolean;
}

/**
 * Premium branded share message (owner spec 29-07 §5). Every field is built
 * from the LOGGED-IN sharer's live profile at share time — never hardcoded.
 * The link is the branded /s/ page carrying their referral code, so previews
 * are rich and every resulting action is attributed back to them.
 */
export function propertyShareMessage(
  property: { id: string; title: string; price?: string | null; location?: string | null; highlights?: string[] },
  promoter?: PromoterCard | null
): string {
  const ref = promoter?.refCode ?? (promoter?.verified ? promoter?.promoterId : null) ?? null;
  const lines: string[] = ["🏡 Jamin Bazaar", `Project: ${property.title}`];
  if (property.location) lines.push(`📍 ${property.location}`);
  if (property.price) lines.push(`💰 ${property.price}`);
  for (const h of (property.highlights ?? []).slice(0, 4)) lines.push(`✅ ${h}`);
  lines.push(
    "",
    "📖 View project details, download the brochure, or schedule a site visit using my personalized link below.",
    "",
    propertyLink(property.id, ref),
  );

  if (promoter?.verified && promoter.name) {
    lines.push("", "Shared by", promoter.name,
      "✅ Verified Jamin Bazaar Promoter" + (promoter.promoterId ? ` · ${promoter.promoterId}` : ""));
    if (promoter.mobile) lines.push(`📞 +${promoter.mobile.replace(/^\+/, "")}`);
    if (promoter.whatsapp || promoter.mobile) lines.push(`💬 WhatsApp: +${(promoter.whatsapp ?? promoter.mobile ?? "").replace(/^\+/, "")}`);
    if (promoter.email) lines.push(`📧 ${promoter.email}`);
    lines.push("📲 Scan the QR code on the page for instant access.");
  }

  lines.push("", "Jamin Bazaar · Signature for Fortune");
  return lines.join("\n");
}
