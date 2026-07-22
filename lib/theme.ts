// Central palette derived from the JAMIN logo. Keep in sync with tailwind.config.js.
export const colors = {
  brand: "#E11B22",
  brandDark: "#B8151B",
  brandSoft: "#FEECEC",
  gold: "#C9A227",
  goldLight: "#E8C766",
  ink: "#1A1A1A",
  inkSoft: "#4B4B4B",
  inkFaint: "#8A8A8A",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F7F8",
  surfaceSunken: "#EFEFF1",
  border: "#E7E7EA",
  success: "#1E9E6A",
  danger: "#E11B22",
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
