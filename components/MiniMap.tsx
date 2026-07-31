import { Image, Pressable, Text, useWindowDimensions, View } from "react-native";

import { colors } from "../lib/theme";

/**
 * Small locator map, composed from OpenStreetMap raster tiles.
 *
 * Deliberately not a WebView: react-native-webview is a native dependency and
 * adding one would force an APK rebuild. Tiles are ordinary PNGs, so a handful
 * of <Image> elements positioned by the standard slippy-map maths gives a real
 * map with nothing new to install.
 *
 * Everything is placed relative to the container's centre (`left: "50%"` plus a
 * pixel translate) rather than a measured width. An earlier version waited on
 * onLayout and rendered nothing at all when that never arrived — anchoring to
 * the centre removes the measurement from the critical path entirely.
 *
 * Only one zoom level is ever fetched, and attribution is shown as
 * OpenStreetMap's tile usage policy requires. Tapping hands off to the full map.
 */

const TILE = 256;

/** Slippy-map projection — fractional tile coordinates for a lat/lng. */
function project(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
  return { x, y, n };
}

export function MiniMap({
  lat,
  lng,
  zoom = 14,
  height = 168,
  onPress,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number;
  onPress?: () => void;
}) {
  const win = useWindowDimensions();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const { x: fx, y: fy, n } = project(lat, lng, zoom);
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  // Enough tiles to cover the card, and no more. Capped at 5x3 = 15 requests
  // per view: the tile policy asks for light, bounded use, and a wide screen
  // would otherwise pull ninety tiles for a 168 px strip.
  const halfC = Math.min(2, Math.ceil(win.width / 2 / TILE));
  const halfR = Math.min(1, Math.ceil(height / 2 / TILE));

  const tiles: { key: string; uri: string; dx: number; dy: number }[] = [];
  for (let i = -halfC; i <= halfC; i++) {
    for (let j = -halfR; j <= halfR; j++) {
      const tx = cx + i;
      const ty = cy + j;
      if (ty < 0 || ty >= n) continue;
      const wrapped = ((tx % n) + n) % n; // the world wraps east-west
      tiles.push({
        key: `${tx}_${ty}`,
        // ⚠️ NOT tile.openstreetmap.org. OSM's operational policy blocks app
        // clients that do not send an identifying User-Agent, and React
        // Native's <Image> does not let us set one — on a real handset every
        // tile came back 403 "Access blocked" and the card rendered as OSM's
        // error graphic (owner report, 2026-07-31). CARTO's basemaps serve the
        // same OpenStreetMap data to app clients; attribution below credits
        // both, as their terms require.
        uri: `https://basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${wrapped}/${ty}.png`,
        dx: (tx - fx) * TILE,
        dy: (ty - fy) * TILE,
      });
    }
  }

  return (
    <Pressable
      onPress={onPress}
      style={{ height, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt }}
    >
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.uri }}
          style={{ position: "absolute", left: "50%", top: "50%", width: TILE, height: TILE, transform: [{ translateX: t.dx }, { translateY: t.dy }] }}
        />
      ))}

      {/* pin, anchored at its point rather than its centre */}
      <View style={{ position: "absolute", left: "50%", top: "50%", alignItems: "center", transform: [{ translateX: -11 }, { translateY: -30 }] }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold, borderWidth: 3, borderColor: "#fff" }} />
        <View
          style={{
            width: 0, height: 0, marginTop: -2,
            borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
            borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#fff",
          }}
        />
      </View>

      <View style={{ position: "absolute", right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.78)", paddingHorizontal: 6, paddingVertical: 2, borderTopLeftRadius: 6 }}>
        <Text style={{ fontSize: 9, color: colors.inkFaint }}>© OpenStreetMap contributors © CARTO</Text>
      </View>
    </Pressable>
  );
}
