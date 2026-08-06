// Communication routing — open the device's native channels to reach a
// promoter directly. The number/email are never shown as text (contact-privacy
// rule); tapping opens the dialer / WhatsApp / SMS / mail composer.
import { Linking, Platform } from "react-native";

const clean = (p?: string | null) => (p ?? "").replace(/[^\d+]/g, "");
const open = (url: string) => Linking.openURL(url).catch(() => {});

export function openCall(phone?: string | null) {
  const p = clean(phone);
  if (p) open(`tel:${p}`);
}

/**
 * Compose a text message.
 *
 * Bug report 22: on Android the SMS action offered WhatsApp alongside two
 * Messages apps. `sms:` resolves as a generic VIEW/SENDTO that anything
 * "messaging" can claim, WhatsApp included. `smsto:` is the narrower
 * ACTION_SENDTO scheme that only real SMS handlers register for, so WhatsApp and
 * other chat apps drop out of the list.
 *
 * A device with two SMS apps installed will still be asked which one to use —
 * Android owns that choice and no app may answer it on the user's behalf without
 * being the default SMS handler itself. The chooser's own "Don't ask again" makes
 * it stick.
 */
export function openSms(phone?: string | null, body?: string) {
  const p = clean(phone);
  if (!p) return;
  const scheme = Platform.OS === "android" ? "smsto" : "sms";
  const sep = Platform.OS === "ios" ? "&" : "?";
  open(body ? `${scheme}:${p}${sep}body=${encodeURIComponent(body)}` : `${scheme}:${p}`);
}

export function openWhatsApp(phone?: string | null, text?: string) {
  const p = clean(phone).replace(/^\+/, "");
  if (!p) return;
  open(`https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ""}`);
}

export function openEmail(email?: string | null, subject?: string, body?: string) {
  if (!email) return;
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  open(`mailto:${email}${q ? `?${q}` : ""}`);
}
