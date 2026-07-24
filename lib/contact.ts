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

export function openSms(phone?: string | null, body?: string) {
  const p = clean(phone);
  if (!p) return;
  const sep = Platform.OS === "ios" ? "&" : "?";
  open(body ? `sms:${p}${sep}body=${encodeURIComponent(body)}` : `sms:${p}`);
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
