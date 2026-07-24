import { Text, TextInput, StyleSheet } from "react-native";

// Route the whole app through Inter with TRUE weights (no synthetic bold).
// Inter is the locked brand face (2026-07-23): digital-native, fintech-grade,
// crisp at small sizes. Headings 600, titles/buttons 500, body 400.
//
// Implementation note (fixed 2026-07-24): the mapped family is injected into the
// INCOMING style and the original render is called with it — so RN's own text
// pipeline applies the font. (The previous approach cloned the render *output*,
// which on RN 0.81 / React 19 wraps text in a context provider → the style was
// a no-op and nothing became Inter.) Elements that already set a `fontFamily`
// (e.g. @expo/vector-icons) are left untouched so icons never break.
const REGULAR = "Inter_400Regular";
const WEIGHT_TO_FONT: Record<string, string> = {
  "100": REGULAR,
  "200": REGULAR,
  "300": REGULAR,
  "400": REGULAR,
  normal: REGULAR,
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
  bold: "Inter_700Bold",
  "800": "Inter_800ExtraBold",
  "900": "Inter_800ExtraBold",
};

function familyForWeight(w: unknown): string {
  return WEIGHT_TO_FONT[w != null ? String(w) : "400"] ?? REGULAR;
}

function patchComponent(Comp: any) {
  if (!Comp || Comp.__interPatched) return;
  Comp.__interPatched = true;

  const original = Comp.render;
  if (typeof original === "function") {
    // forwardRef component (RN Text / TextInput): render(props, ref)
    Comp.render = function (props: any, ref: any) {
      const flat = StyleSheet.flatten(props?.style) || {};
      // Respect explicit fonts (icon sets, custom faces) — never override them.
      if (flat.fontFamily) return original.call(this, props, ref);
      const family = familyForWeight(flat.fontWeight);
      // user style first, our mapped family + cleared weight last (wins).
      const next = { ...props, style: [props?.style, { fontFamily: family, fontWeight: undefined }] };
      return original.call(this, next, ref);
    };
  } else {
    // Fallback for any non-forwardRef variant.
    Comp.defaultProps = { ...(Comp.defaultProps || {}), style: [{ fontFamily: REGULAR }, Comp.defaultProps?.style] };
  }
}

/** Route all <Text>/<TextInput> through Inter. Call once before first render. */
export function applyAppFontGlobally() {
  patchComponent(Text as any);
  patchComponent(TextInput as any);
}
