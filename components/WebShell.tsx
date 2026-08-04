import type { ReactNode } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { colors } from "@/lib/theme";
import { elevation } from "./ui";

/** Below this the phone layout is already the right answer — a browser window
 *  this narrow IS a phone, or a tablet held in portrait. */
const DESKTOP_MIN = 1024;
/** The widest comfortable measure for the app frame. Past roughly this point
 *  a single column stops reading as a designed product and starts reading as
 *  a stretched phone, which is exactly what this component exists to fix. */
const FRAME_MAX = 1180;

/**
 * Centres the app in a framed column once the browser is desktop-sized.
 *
 * The web export renders the same phone-first tree as the APK, so on a 1280px
 * monitor every container measured a full 1280px wide — the UI was not broken,
 * just stretched edge to edge with no designed desktop shape.
 *
 * ⚠️ This is deliberately an IDENTITY WRAPPER everywhere except desktop web.
 * On native it returns `children` untouched before rendering a single view, so
 * the APK's tree is byte-identical to before this component existed and no
 * native layout can regress through it. Mobile browsers take the same path.
 */
export function WebShell({ children }: { children: ReactNode }) {
  // Called unconditionally — the early returns below must never change the
  // hook order between renders.
  const { width } = useWindowDimensions();

  if (Platform.OS !== "web" || width < DESKTOP_MIN) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSunken, alignItems: "center" }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: FRAME_MAX,
          backgroundColor: colors.surfaceAlt,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          ...elevation.card,
        }}
      >
        {children}
      </View>
    </View>
  );
}
