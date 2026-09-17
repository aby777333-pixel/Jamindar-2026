import { useCallback, useMemo, useState } from "react";
import { Image, Modal, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";
import type { PlotRow } from "@/components/PlotPlan";

/**
 * THE APPROVED LAYOUT IMAGE, INTERACTIVE (migration 0097, 2026-09-17).
 *
 * The same published snapshot the website reads — `properties.plan_image` —
 * drawn the same way: the original image untouched, a translucent overlay of
 * plot polygons on top, both inside ONE transformed view so pinch and pan can
 * never pull them apart.
 *
 * ⚠️ THE STAGE IS LAID OUT AT FIT-WIDTH SIZE, NOT AT THE IMAGE'S PIXEL SIZE.
 * A 3,545 × 9,451 view would make Android decode a bitmap of that size times
 * the screen density. The stage is `width × width·h/w` dp and the polygons use
 * `viewBox="0 0 w h"`, so the geometry is identical and only the zoom is a
 * transform.
 *
 * ⚠️ TAPS ARE HIT-TESTED, not delivered to SVG shapes: a tap is converted
 * through the live transform into image coordinates and tested against the
 * polygons, which stays exact at every zoom and never fights the pan gesture.
 */

export type PlanImage = {
  version_id: string;
  version_no: number;
  src: string;
  hi?: string | null;
  w: number;
  h: number;
  metres_per_px?: number | null;
  scale_note?: string | null;
  style?: {
    status?: Record<string, { color?: string; opacity?: number; visible?: boolean }>;
    road?: { color?: string; opacity?: number; visible?: boolean };
    open_space?: { color?: string; opacity?: number; visible?: boolean };
  } | null;
  review_plots?: string[] | null;
  shapes: { k: string; plot?: string; uid?: string; label?: string; pts: [number, number][] }[];
};

const DEFAULT_TINT: Record<string, { color: string; opacity: number }> = {
  available: { color: "#1f8a5b", opacity: 0.1 },
  reserved: { color: "#c9962c", opacity: 0.3 },
  booked: { color: "#c8102e", opacity: 0.3 },
  sold: { color: "#6e0303", opacity: 0.36 },
  blocked: { color: "#8a8f98", opacity: 0.4 },
  not_released: { color: "#5b6b7a", opacity: 0.34 },
};
export const PLAN_STATUS_LABEL: Record<string, string> = {
  available: "Available",
  reserved: "On hold",
  booked: "Booked",
  sold: "Sold",
  blocked: "Blocked",
  not_released: "Not released",
};
const MAX_ZOOM = 8;

const pointIn = (x: number, y: number, p: [number, number][]) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const polyArea = (p: [number, number][]) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(a / 2);
};

export function hasPlanImage(img: PlanImage | null | undefined): img is PlanImage {
  return !!img?.src && !!img.w && !!img.h && (img.shapes ?? []).some((s) => s.k === "plot");
}

function Map({
  image,
  plots,
  width,
  height,
  visible,
  onSelect,
  selected,
  showRoads,
  showOpen,
  onlyAvailable,
}: {
  image: PlanImage;
  plots: PlotRow[];
  width: number;
  height: number;
  visible?: Set<string>;
  onSelect: (p: PlotRow | null) => void;
  selected: string | null;
  showRoads: boolean;
  showOpen: boolean;
  onlyAvailable: boolean;
}) {
  const W = image.w;
  const H = image.h;
  const stageW = width;
  const stageH = (width * H) / W;
  const minScale = Math.min(1, height / stageH);

  const byUid = useMemo(() => {
    const m: Record<string, PlotRow> = {};
    plots.forEach((p: any) => p.uid && (m[p.uid] = p));
    return m;
  }, [plots]);
  const byNo = useMemo(() => {
    const m: Record<string, PlotRow> = {};
    plots.forEach((p) => (m[String(p.plot ?? (p as any).plot_no ?? "").trim().toLowerCase()] = p));
    return m;
  }, [plots]);
  const plotShapes = useMemo(
    () =>
      image.shapes
        .filter((s) => s.k === "plot" && Array.isArray(s.pts) && s.pts.length >= 3)
        .map((s) => ({ s, rec: (s.uid && byUid[s.uid]) || byNo[String(s.plot ?? "").trim().toLowerCase()], area: polyArea(s.pts) }))
        .filter((x): x is { s: PlanImage["shapes"][number]; rec: PlotRow; area: number } => !!x.rec),
    [image.shapes, byUid, byNo],
  );
  const zones = useMemo(() => image.shapes.filter((s) => s.k !== "plot" && s.pts?.length >= 3), [image.shapes]);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const s0 = useSharedValue(1);
  const x0 = useSharedValue(0);
  const y0 = useSharedValue(0);
  const fx = useSharedValue(0);
  const fy = useSharedValue(0);

  const clampX = (x: number, s: number) => {
    "worklet";
    const sw = stageW * s;
    return sw <= width ? (width - sw) / 2 : Math.min(0, Math.max(width - sw, x));
  };
  const clampY = (y: number, s: number) => {
    "worklet";
    const sh = stageH * s;
    return sh <= height ? (height - sh) / 2 : Math.min(0, Math.max(height - sh, y));
  };

  const tapAt = useCallback(
    (x: number, y: number, s: number, ox: number, oy: number) => {
      const ix = ((x - ox) / s / stageW) * 1;
      const iy = ((y - oy) / s / stageH) * 1;
      let best: (typeof plotShapes)[number] | null = null;
      for (const p of plotShapes) {
        if (pointIn(ix, iy, p.s.pts) && (!best || p.area < best.area)) best = p;
      }
      if (best && visible && !visible.has(String(best.rec.plot))) best = null;
      onSelect(best ? best.rec : null);
    },
    [plotShapes, stageW, stageH, onSelect, visible],
  );

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      s0.value = scale.value;
      x0.value = tx.value;
      y0.value = ty.value;
      fx.value = e.focalX;
      fy.value = e.focalY;
    })
    .onUpdate((e) => {
      const s = Math.min(MAX_ZOOM, Math.max(minScale, s0.value * e.scale));
      const k = s / s0.value;
      scale.value = s;
      tx.value = clampX(e.focalX - (fx.value - x0.value) * k, s);
      ty.value = clampY(e.focalY - (fy.value - y0.value) * k, s);
    });
  const pan = Gesture.Pan()
    .minDistance(6)
    .averageTouches(true)
    .onStart(() => {
      x0.value = tx.value;
      y0.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = clampX(x0.value + e.translationX, scale.value);
      ty.value = clampY(y0.value + e.translationY, scale.value);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((e) => {
      const s = scale.value >= MAX_ZOOM * 0.95 ? 1 : Math.min(MAX_ZOOM, scale.value * 2);
      const k = s / scale.value;
      const nx = clampX(e.x - (e.x - tx.value) * k, s);
      const ny = clampY(e.y - (e.y - ty.value) * k, s);
      scale.value = withTiming(s);
      tx.value = withTiming(nx);
      ty.value = withTiming(ny);
    });
  const singleTap = Gesture.Tap()
    .maxDistance(10)
    .onEnd((e) => {
      runOnJS(tapAt)(e.x, e.y, scale.value, tx.value, ty.value);
    });
  const gesture = Gesture.Simultaneous(Gesture.Exclusive(doubleTap, singleTap), Gesture.Simultaneous(pinch, pan));

  const stageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const zoomBy = (f: number) => {
    const s = Math.min(MAX_ZOOM, Math.max(minScale, scale.value * f));
    const k = s / scale.value;
    const cx = width / 2;
    const cy = height / 2;
    tx.value = withTiming(clampX(cx - (cx - tx.value) * k, s));
    ty.value = withTiming(clampY(cy - (cy - ty.value) * k, s));
    scale.value = withTiming(s);
  };
  const fitAll = () => {
    scale.value = withTiming(minScale);
    tx.value = withTiming(clampX(0, minScale));
    ty.value = withTiming(clampY(0, minScale));
  };

  const P = (pts: [number, number][]) => pts.map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(" ");
  const tint = (st: string) => {
    const o = image.style?.status?.[st];
    const d = DEFAULT_TINT[st] ?? DEFAULT_TINT.available;
    return { color: o?.color || d.color, opacity: typeof o?.opacity === "number" ? o.opacity : d.opacity, visible: o?.visible !== false };
  };
  const strokeK = W / stageW; // 1 dp in image units at scale 1

  return (
    <View style={{ width, height, overflow: "hidden", backgroundColor: "#fff" }}>
      <GestureDetector gesture={gesture}>
        <View style={{ width, height }} collapsable={false}>
          <Animated.View style={[{ width: stageW, height: stageH, transformOrigin: "left top" }, stageStyle]}>
            <Image source={{ uri: image.src }} style={{ width: stageW, height: stageH }} resizeMode="stretch" />
            <Svg
              width={stageW}
              height={stageH}
              viewBox={`0 0 ${W} ${H}`}
              style={{ position: "absolute", left: 0, top: 0 }}
              pointerEvents="none"
            >
              {zones.map((z, i) => {
                const road = z.k === "road";
                const on = road ? showRoads : showOpen && (z.k === "open_space" || z.k === "reserved");
                const cfg = road ? image.style?.road : image.style?.open_space;
                if (!on || cfg?.visible === false) return null;
                return (
                  <Polygon
                    key={`z${i}`}
                    points={P(z.pts)}
                    fill={cfg?.color || (road ? "#e07a2e" : "#3f9c35")}
                    fillOpacity={typeof cfg?.opacity === "number" ? cfg.opacity : 0.32}
                    stroke={cfg?.color || (road ? "#b4561a" : "#2c7a24")}
                    strokeWidth={2 * strokeK}
                  />
                );
              })}
              {plotShapes.map(({ s, rec }) => {
                const st = String(rec.status ?? "available").toLowerCase();
                const t = tint(st);
                const filteredOut = !!visible && !visible.has(String(rec.plot));
                const dimmed = filteredOut || (onlyAvailable && st !== "available");
                const active = selected === String(rec.plot);
                return (
                  <Polygon
                    key={s.uid ?? String(rec.plot)}
                    points={P(s.pts)}
                    fill={dimmed ? "#2b2b2b" : active ? "#d4a017" : t.color}
                    fillOpacity={dimmed ? 0.34 : active ? 0.22 : t.visible ? (onlyAvailable ? Math.max(0.22, t.opacity) : t.opacity) : 0}
                    stroke={active ? "#8a5a00" : onlyAvailable && !dimmed ? t.color : "none"}
                    strokeWidth={(active ? 3 : 2) * strokeK}
                  />
                );
              })}
            </Svg>
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={{ position: "absolute", right: 10, bottom: 10, flexDirection: "row", gap: 6 }}>
        {[
          ["remove", () => zoomBy(1 / 1.6), "Zoom out"],
          ["add", () => zoomBy(1.6), "Zoom in"],
          ["scan-outline", fitAll, "Show whole layout"],
        ].map(([icon, fn, label]) => (
          <Pressable
            key={label as string}
            onPress={fn as () => void}
            accessibilityLabel={label as string}
            hitSlop={6}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.62)", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={icon as any} size={18} color="#fff" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** A small toggle pill, styled like the plan's other controls. */
function Toggle({ label, on, onPress, swatch }: { label: string; on: boolean; onPress: () => void; swatch?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? colors.ink : colors.border,
        backgroundColor: on ? colors.ink : colors.surface,
      }}
    >
      {swatch ? <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: swatch }} /> : null}
      <Text style={{ fontSize: 12, fontWeight: "600", color: on ? colors.surface : colors.inkSoft }}>{label}</Text>
    </Pressable>
  );
}

export function PlanImageMap({
  image,
  plots,
  visible,
  onSelect,
  height = 460,
}: {
  image: PlanImage;
  plots: PlotRow[];
  /** Plot numbers passing the filters; undefined = all. */
  visible?: Set<string>;
  onSelect?: (p: PlotRow) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showRoads, setShowRoads] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [full, setFull] = useState(false);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const pick = useCallback(
    (p: PlotRow | null) => {
      setSelected(p ? String(p.plot) : null);
      if (!p) return;
      /* ⚠️ Leave full screen first: the plot sheet is its own Modal, and
         presenting one modal over another from a different component is
         unreliable on iOS. The in-page map keeps the selection highlighted. */
      setFull(false);
      onSelect?.(p);
    },
    [onSelect],
  );

  const mapped = useMemo(() => {
    const nos = new Set(image.shapes.filter((s) => s.k === "plot").map((s) => String(s.plot ?? "").toLowerCase()));
    return plots.filter((p) => nos.has(String(p.plot).toLowerCase()));
  }, [image.shapes, plots]);
  const unmapped = plots.filter((p) => !mapped.includes(p));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    mapped.forEach((p) => {
      const st = String(p.status ?? "available").toLowerCase();
      c[st] = (c[st] ?? 0) + 1;
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [mapped]);
  const hasRoads = image.shapes.some((s) => s.k === "road");
  const hasOpen = image.shapes.some((s) => s.k === "open_space");

  const controls = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
      <Toggle label="Available only" on={onlyAvailable} onPress={() => setOnlyAvailable((v) => !v)} />
      {hasRoads ? <Toggle label="Roads" swatch="#e07a2e" on={showRoads} onPress={() => setShowRoads((v) => !v)} /> : null}
      {hasOpen ? <Toggle label="Open space" swatch="#3f9c35" on={showOpen} onPress={() => setShowOpen((v) => !v)} /> : null}
    </View>
  );
  const mapProps = { image, plots, visible, onSelect: pick, selected, showRoads, showOpen, onlyAvailable };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {counts.map(([st, n]) => {
          const t = image.style?.status?.[st]?.color || (DEFAULT_TINT[st] ?? DEFAULT_TINT.available).color;
          return (
            <View key={st} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: t, opacity: 0.75 }} />
              <Text style={{ fontSize: 11.5, color: colors.inkFaint }}>
                {PLAN_STATUS_LABEL[st] ?? st} · {n}
              </Text>
            </View>
          );
        })}
      </View>
      {controls}
      <View onLayout={onLayout} style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
        {width > 0 ? <Map {...mapProps} width={width} height={height} /> : <View style={{ height }} />}
        <Pressable
          onPress={() => setFull(true)}
          accessibilityLabel="Open the layout full screen"
          style={{ position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.62)", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }}
        >
          <Ionicons name="expand" size={13} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 11.5, fontWeight: "700" }}>Full screen</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 11.5, color: colors.inkFaint, lineHeight: 17 }}>
        Tap a plot for its record · pinch or double-tap to zoom · drag to move. The approved layout is shown as issued.
        {unmapped.length
          ? ` Plot record${unmapped.length === 1 ? "" : "s"} ${unmapped.map((p) => p.plot).join(", ")} ${unmapped.length === 1 ? "is" : "are"} not on this image.`
          : ""}
      </Text>

      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)} statusBarTranslucent>
        {/* A Modal is a separate native root — gestures need their own root view. */}
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#111" }}>
          <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, gap: 8, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 15 }}>Approved layout</Text>
              <Pressable onPress={() => setFull(false)} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            {controls}
          </View>
          <Map {...mapProps} width={win.width} height={win.height - insets.top - insets.bottom - 110} />
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
