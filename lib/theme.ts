// Central palette derived from the JAMIN logo + premium reference set.
// Keep in sync with tailwind.config.js.
export const colors = {
  brand: "#E11B22",
  brandDark: "#B8151B",
  brandSoft: "#FDECEC",
  // premium "elite" gold
  gold: "#E0A423",
  goldSoft: "#FBF1DC",
  goldLight: "#EAC466",
  goldDark: "#9C7D1A",
  // dark navy for high-emphasis cards (business card, concierge, official)
  navy: "#141A2E",
  navySoft: "#1E2740",
  // ink / text
  ink: "#15151B",
  inkSoft: "#4B4B57",
  inkFaint: "#86868B",
  // surfaces (cool premium neutrals)
  surface: "#FFFFFF",
  surfaceAlt: "#F1F2F6",
  surfaceSunken: "#E9EAEF",
  border: "#E7E8EE",
  success: "#14A05A",
  successSoft: "#E4F6EC",
  danger: "#E11B22",
  onDark: "#FFFFFF",
  onDarkFaint: "#9AA1B4",
};

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
export const type = {
  caption: { fontSize: 10, lineHeight: 16 },   // 16 ÷ φ
  small: { fontSize: 13, lineHeight: 21 },      // between caption and body
  body: { fontSize: 16, lineHeight: 26 },       // base
  subhead: { fontSize: 20, lineHeight: 32 },    // 16 × √φ
  title: { fontSize: 26, lineHeight: 34 },      // 16 × φ
  hero: { fontSize: 33, lineHeight: 42 },       // 16 × φ^1.5
} as const;
