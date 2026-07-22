import type { Href } from "expo-router";
import type { UserRole } from "./types";

// Deterministic intent parser so voice/text commands reliably drive the app.
// Navigation + global actions are matched here; free-form questions fall through
// to the Jamindar consultant brain.

export type Intent =
  | { kind: "navigate"; href: Href; say: string }
  | { kind: "action"; action: "sign_out" | "change_language" | "read_aloud" | "stop"; say: string; arg?: string }
  | { kind: "none" };

interface Rule {
  test: RegExp;
  build: (role: UserRole) => Intent;
}

const RULES: Rule[] = [
  // navigation
  {
    test: /\b(home|dashboard|main screen|home page|go home|take me home)\b/i,
    build: () => ({ kind: "navigate", href: "/(tabs)/home", say: "Opening Home." }),
  },
  {
    test: /\b(propert|plots?|lands?|listings?|browse|show me plots|show properties)\b/i,
    build: () => ({ kind: "navigate", href: "/(tabs)/properties", say: "Opening Properties." }),
  },
  {
    test: /\b(assistant|jamindar|talk to you|voice help)\b/i,
    build: () => ({ kind: "navigate", href: "/(tabs)/assistant", say: "I'm here." }),
  },
  {
    test: /\b(account|my profile|profile page|settings)\b/i,
    build: () => ({ kind: "navigate", href: "/(tabs)/account", say: "Opening your Account." }),
  },
  {
    test: /\b(preferences?|questionnaire|my requirements|onboarding)\b/i,
    build: () => ({ kind: "navigate", href: "/buyer/onboarding", say: "Opening your preferences." }),
  },
  {
    test: /\b(calculator|calculators|emi|loan calc|stamp duty|purchase cost|rental yield)\b/i,
    build: () => ({ kind: "navigate", href: "/tools/calculators", say: "Opening the calculators." }),
  },
  {
    test: /\b(compare|comparison|compare shortlist|compare plots|compare properties)\b/i,
    build: () => ({ kind: "navigate", href: "/tools/compare", say: "Opening your comparison." }),
  },
  {
    test: /\b(legal|documents guide|explain documents|law guide|patta guide|legal guide)\b/i,
    build: () => ({ kind: "navigate", href: "/tools/legal", say: "Opening the legal guide." }),
  },
  {
    test: /\b(admin|admin console|administration|manage everything)\b/i,
    build: (role) =>
      role === "super_admin"
        ? { kind: "navigate", href: "/admin", say: "Opening the Admin Console." }
        : { kind: "none" },
  },
  {
    test: /\b(promoter dashboard|my leads|my dashboard|promoter panel)\b/i,
    build: (role) =>
      role === "promoter"
        ? { kind: "navigate", href: "/promoter", say: "Opening your Promoter dashboard." }
        : { kind: "none" },
  },
  // global actions
  {
    test: /\b(sign out|log ?out|logout)\b/i,
    build: () => ({ kind: "action", action: "sign_out", say: "Do you want me to sign you out?" }),
  },
  {
    test: /\b(stop|wait|be quiet|pause speaking|silence)\b/i,
    build: () => ({ kind: "action", action: "stop", say: "" }),
  },
  {
    test: /\bread (this|it) (aloud|out)\b|\bread aloud\b/i,
    build: () => ({ kind: "action", action: "read_aloud", say: "" }),
  },
];

const LANG_MAP: { re: RegExp; code: string; name: string }[] = [
  { re: /\benglish\b/i, code: "en-IN", name: "English" },
  { re: /\bhindi|हिन्दी\b/i, code: "hi-IN", name: "Hindi" },
  { re: /\btamil|தமிழ்\b/i, code: "ta-IN", name: "Tamil" },
  { re: /\btelugu\b/i, code: "te-IN", name: "Telugu" },
  { re: /\bkannada\b/i, code: "kn-IN", name: "Kannada" },
  { re: /\bmalayalam\b/i, code: "ml-IN", name: "Malayalam" },
  { re: /\bmarathi\b/i, code: "mr-IN", name: "Marathi" },
  { re: /\bgujarati\b/i, code: "gu-IN", name: "Gujarati" },
  { re: /\bbengali\b/i, code: "bn-IN", name: "Bengali" },
  { re: /\bpunjabi\b/i, code: "pa-IN", name: "Punjabi" },
];

export function parseIntent(text: string, role: UserRole): Intent {
  const t = text.trim();
  if (!t) return { kind: "none" };

  // "switch to <language>" / "speak in <language>"
  if (/\b(switch|change|speak|talk|reply)\b.*\b(language|in)\b/i.test(t) || /\bin (hindi|tamil|telugu|kannada|malayalam|marathi|gujarati|bengali|punjabi|english)\b/i.test(t)) {
    const lang = LANG_MAP.find((l) => l.re.test(t));
    if (lang) return { kind: "action", action: "change_language", say: `Switching to ${lang.name}.`, arg: lang.code };
  }

  for (const rule of RULES) {
    if (rule.test.test(t)) {
      const intent = rule.build(role);
      if (intent.kind !== "none") return intent;
    }
  }
  return { kind: "none" };
}
