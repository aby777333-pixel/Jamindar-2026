// Deep-link / QR acquisition capture (migrations 0006/0015).
// Parses the URL the app was opened with (referral link, shared property link,
// campaign/QR) and stores the entry source until the user registers, when
// flushPendingAcquisition() credits the referrer.
import * as Linking from "expo-linking";
import { setPendingAcquisition } from "./audit";
import type { AcquisitionSource } from "./types";

function mapSource(src?: string | null): AcquisitionSource | null {
  if (!src) return null;
  const s = src.toLowerCase();
  if (s.includes("qr")) return "qr";
  if (s.includes("promoter")) return "promoter_referral";
  if (s.includes("friend")) return "friend_referral";
  if (s.includes("facebook") || s.includes("insta") || s.includes("social") || s.includes("ad")) return "social_ad";
  if (s.includes("google")) return "google_search";
  if (s.includes("web")) return "website";
  return null;
}

/** Inspect an inbound URL and, if it carries attribution, stash it for after login. */
export function captureFromUrl(url: string | null): void {
  if (!url) return;
  try {
    const parsed = Linking.parse(url);
    const q = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
    const ref = (q.ref || q.referral || q.code)?.toString() || null;
    const property = (q.property || q.p)?.toString() || null;
    const src = (q.src || q.utm_source || q.source)?.toString() || null;
    const campaign = (q.utm_campaign || q.campaign)?.toString() || null;
    if (!ref && !property && !src && !campaign) return;

    let source: AcquisitionSource = "organic";
    if (ref) source = mapSource(src) ?? "friend_referral";
    else if (property) source = "property_link";
    else source = mapSource(src) ?? "website";

    setPendingAcquisition({
      source,
      referral_code: ref,
      campaign,
      property_id: property,
      medium: parsed.path ?? null,
      meta: { src, url },
    });
  } catch {
    /* non-critical */
  }
}

/** Start listening for links: the launch URL + any while the app is open. */
export function initAcquisitionCapture(): () => void {
  Linking.getInitialURL().then(captureFromUrl).catch(() => {});
  const sub = Linking.addEventListener("url", (e) => captureFromUrl(e.url));
  return () => sub.remove();
}

/** Manually record an invite code the user typed (e.g. on the login screen). */
export function captureInviteCode(code: string): void {
  const c = code.trim();
  if (!c) return;
  setPendingAcquisition({ source: "friend_referral", referral_code: c, meta: { entry: "manual" } });
}
