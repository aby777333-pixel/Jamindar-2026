import React from "react";
import { Text, TextInput, StyleSheet } from "react-native";

// Map every fontWeight to the matching Inter variant so the whole app
// renders in this premium typeface with true weights (no synthetic bold).
// Inter is the locked brand face (2026-07-23): digital-native, fintech-grade,
// crisp at small sizes. Headings 600, titles/buttons 500, body 400.
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
  if (!Comp || Comp.__fontPatched) return;
  // Baseline (works on native + react-native-web): default all text to the font.
  Comp.defaultProps = Comp.defaultProps || {};
  Comp.defaultProps.style = [{ fontFamily: REGULAR }, Comp.defaultProps.style];

  // True weight mapping via render hook (native).
  const original = Comp.render;
  if (typeof original === "function") {
    Comp.__fontPatched = true;
    Comp.render = function (...args: any[]) {
      const element = original.apply(this, args);
      if (!element) return element;
      const flat = StyleSheet.flatten(element.props?.style) || {};
      const family = familyForWeight(flat.fontWeight);
      // mapped family + cleared weight win (appended last)
      return React.cloneElement(element, {
        style: [element.props.style, { fontFamily: family, fontWeight: undefined }],
      });
    };
  } else {
    Comp.__fontPatched = true;
  }
}

/** Route all <Text>/<TextInput> through Inter. Call once before first render. */
export function applyAppFontGlobally() {
  patchComponent(Text as any);
  patchComponent(TextInput as any);
}
