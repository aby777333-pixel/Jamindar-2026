// Central palette derived from the JAMIN logo + premium reference set.
// Keep in sync with tailwind.config.js.
//
// Contrast (owner directive 05-08, "High Accessibility"): the light palette was
// measured against WCAG AA, not eyeballed. Three tokens were failing on the
// surfaces they are actually drawn on, so they were deepened — the hues are
// unchanged, only the value:
//   inkFaint #86868B → #68686F   3.62 → 5.53 on white (4.94 on surfaceAlt,
//     4.60 on surfaceSunken). This is the app's caption colour across ~385 call
//     sites and is text/icon only — it is never a fill — so deepening it costs
//     nothing but readability. ink > inkSoft > inkFaint still reads as three
//     distinct levels.
//   success  #14A05A → #0C8046   3.38 → 5.01, and it doubles as a fill, so the
//     white text sitting ON it gains the same 5.01.
//   goldDark #9C7D1A → #8A6E17   3.92 → 4.86.
// Tinted badge pairings (on brandSoft / goldSoft / successSoft) land at
// 4.2–4.5, which is AA for the bold, large-ish text those badges use.
const LIGHT = {
  brand: "#E11B22",
  brandDark: "#B8151B",
  brandSoft: "#FDECEC",
  // premium "elite" gold
  gold: "#E0A423",
  goldSoft: "#FBF1DC",
  goldLight: "#EAC466",
  goldDark: "#8A6E17",
  // dark navy for high-emphasis cards (business card, concierge, official)
  navy: "#141A2E",
  navySoft: "#1E2740",
  // ink / text
  ink: "#15151B",
  inkSoft: "#4B4B57",
  inkFaint: "#68686F",
  // surfaces (cool premium neutrals)
  surface: "#FFFFFF",
  surfaceAlt: "#F1F2F6",
  surfaceSunken: "#E9EAEF",
  border: "#E7E8EE",
  success: "#0C8046",
  successSoft: "#E4F6EC",
  danger: "#E11B22",
  onDark: "#FFFFFF",
  onDarkFaint: "#9AA1B4",
};

/**
 * Dark mode — platinum on graphite.
 *
 * Every token keeps its MEANING so nothing has to be re-reasoned per screen:
 * `ink` is still the most readable text, `surface` is still what a card sits
 * on, `border` still separates. Only the values change.
 *
 * Contrast was chosen against its own background, not eyeballed: ink on
 * surface is ~14:1 and inkFaint on surface ~4.8:1, both past WCAG AA, so the
 * quiet grey captions the app leans on stay readable rather than disappearing.
 * The brand red is lifted slightly because #E11B22 on graphite reads muddy.
 */
const DARK: typeof LIGHT = {
  brand: "#FF4A4F",
  brandDark: "#E11B22",
  brandSoft: "#2C1618",
  gold: "#E7B441",
  goldSoft: "#2A2213",
  goldLight: "#F0CE7A",
  goldDark: "#C79A2A",
  navy: "#0C1020",
  navySoft: "#161C30",
  // platinum text
  ink: "#F3F4F8",
  inkSoft: "#C2C6D2",
  inkFaint: "#8C93A3",
  // graphite surfaces, each a clear step apart so cards read as raised
  surface: "#171A21",
  surfaceAlt: "#0F1116",
  surfaceSunken: "#232733",
  border: "#2E333F",
  success: "#33C77B",
  successSoft: "#12291D",
  danger: "#FF4A4F",
  onDark: "#FFFFFF",
  onDarkFaint: "#9AA1B4",
};

export type ThemeMode = "light" | "dark";

/** Light unless the member deliberately chooses otherwise. */
let activeMode: ThemeMode = "light";
let active = LIGHT;

export function setThemeMode(mode: ThemeMode) {
  activeMode = mode;
  active = mode === "dark" ? DARK : LIGHT;
}
export function getThemeMode(): ThemeMode {
  return activeMode;
}
export const palettes = { light: LIGHT, dark: DARK } as const;

/**
 * `colors` stays a plain-looking object so all ~2,035 existing `colors.x`
 * reads keep working untouched — it just resolves against whichever palette is
 * active. Two facts make this safe here: the app uses no StyleSheet.create,
 * so every style object is rebuilt on render, and only a handful of
 * module-scope constants captured a colour (those were made lazy).
 */
export const colors: typeof LIGHT = new Proxy({} as typeof LIGHT, {
  get: (_t, prop: string) => (active as any)[prop],
  has: (_t, prop) => prop in active,
  ownKeys: () => Reflect.ownKeys(active),
  getOwnPropertyDescriptor: (_t, prop) => ({
    value: (active as any)[prop as string],
    enumerable: true,
    configurable: true,
  }),
});

// Tile accent palette for the home module grid (soft, premium).
export const tileAccents = {
  green: { bg: "#E7F6EE", fg: "#1E9E6A" },
  indigo: { bg: "#ECEEFB", fg: "#4B57C9" },
  red: { bg: "#FEECEC", fg: "#E11B22" },
  violet: { bg: "#F2EBFB", fg: "#7C4BC9" },
  blue: { bg: "#E8F1FE", fg: "#2B6FE1" },
  teal: { bg: "#E4F6F4", fg: "#159A8C" },
  amber: { bg: "#FBF1DC", fg: "#C9A227" },
  rose: { bg: "#FDEBF0", fg: "#D14B7C" },
} as const;

export type TileAccent = keyof typeof tileAccents;

// ── Golden-ratio design system ─────────────────────────────
// φ ≈ 1.618. One scale for spacing and one for type, so every screen
// shares the same harmonic rhythm.
export const PHI = 1.618;

// Fibonacci spacing scale (converges to φ) — use for margins, padding, radii.
export const space = { xxs: 5, xs: 8, sm: 13, md: 21, lg: 34, xl: 55, xxl: 89 } as const;

// Golden-ratio type scale, anchored on a 16px body. Each step ×/÷ φ.
// line height = size × φ (rounded), per golden-ratio typography.
/**
 * The type ladder.
 *
 * The original six steps jumped 10 → 13 → 16, leaving no token for the sizes
 * screens actually need. So screens hard-coded their own: an audit found ~460
 * literal fontSize values across twenty distinct sizes (11, 11.5, 12, 12.5,
 * 13.5, 14, 14.5, 15, 17, 19 …), which is what makes the app read as assembled
 * rather than designed.
 *
 * `micro`, `callout` and `headline` fill those gaps so there is a token for
 * every legitimate need and no reason left to hard-code. The six original
 * steps are byte-for-byte unchanged, so nothing that already uses them moves.
 *
 * Use these everywhere. A literal fontSize in a screen is now a bug, with one
 * exception: SVG drawings (PlotPlan) size text in drawing units, not points.
 */
export const type = {
  caption: { fontSize: 10, lineHeight: 16 },   // 16 ÷ φ
  micro: { fontSize: 12, lineHeight: 18 },      // absorbs 11 / 11.5 / 12 / 12.5
  small: { fontSize: 13, lineHeight: 21 },      // between caption and body
  callout: { fontSize: 15, lineHeight: 22 },    // absorbs 14 / 14.5 / 15
  body: { fontSize: 16, lineHeight: 26 },       // base
  headline: { fontSize: 18, lineHeight: 26 },   // absorbs 17 / 18 / 19
  subhead: { fontSize: 20, lineHeight: 32 },    // 16 × √φ
  title: { fontSize: 26, lineHeight: 34 },      // 16 × φ
  hero: { fontSize: 33, lineHeight: 42 },       // 16 × φ^1.5
} as const;
