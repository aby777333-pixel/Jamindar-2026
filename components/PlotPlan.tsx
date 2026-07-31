import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";

import QRCode from "react-native-qrcode-svg";

import { colors } from "../lib/theme";

/**
 * Interactive DTCP site plan.
 *
 * The plan is drawn from geometry traced out of the sanctioned approval drawing,
 * so it can be checked against the legal sheet rather than redrawn by eye. Every
 * quoted size and area comes from the plot schedule, never from these
 * coordinates — the drawn rectangles are set out to fill each row band and read
 * a little off the quoted metres.
 *
 * Zoom drives the SVG viewBox rather than a View transform, so the vector is
 * re-rasterised at every level and stays sharp however far the buyer goes in.
 */

export interface PlotRow {
  plot: string;
  status?: string;
  size_sqft?: number | null;
  facing?: string;
  block?: string;
  size_sqm?: number;
  dim_m?: string;
  road_m?: number;
  corner?: boolean;
  price?: number | null;
  offer_price?: number | null;
  booking_amount?: number | null;
  registration_charges?: number | null;
  development_charges?: number | null;
  /** Outline as the sheet draws it — already clipped to the site boundary. */
  poly?: [number, number][];
  /** Label anchor (polygon centroid). */
  at?: [number, number];
  clipped?: boolean;
}

export interface PlotPlanGeometry {
  viewBox: [number, number, number, number];
  boundary: [number, number][];
  osr?: { polygon?: [number, number][]; label?: string; areaSqm?: number };
  existingRoad?: { quad?: [number, number][]; label?: string };
  roads?: { label: string; band: [number, number, number, number]; rotate?: number }[];
  dimensions?: { label: string; from: [number, number]; to: [number, number] }[];
  amenities?: { kind: string; label: string; at?: [number, number] }[];
  metresPerUnit?: number;
  approvalNo?: string;
  scale?: string;
  /** Title-block fields, as carried on properties.plot_plan. */
  surveyNos?: string;
  village?: string;
  taluk?: string;
  authority?: string;
  totalPlots?: number;
  /** Either a plain string, or the sheet's structured area statement rows. */
  areaStatement?: string | { label?: string; area?: string | number }[];
  notes?: string;
}

const FILL: Record<string, string> = {
  // Warm white rather than pure white: a paper-white cell on a warm road wash
  // reads as a hole punched in the sheet, not as a drawn plot.
  available: "#FDFBF7",
  reserved: colors.gold,
  booked: "#D93025",
  sold: "#4A4A4A",
  blocked: "#E6E7E2",
};
// A sanctioned layout sheet draws plots as hairline-ruled cells with near-black
// numerals — the bright green outline and green numeral we had made the plan
// read as a diagram rather than a drawing. Status still reads instantly from
// the fills below; only the linework and numerals became draughting-coloured.
const STROKE: Record<string, string> = {
  available: "#3B4A40",
  reserved: colors.goldDark,
  booked: "#A61B10",
  sold: "#2E2E2E",
  blocked: "#9A9A93",
};
const LABEL: Record<string, string> = {
  available: "#17241D",
  reserved: "#FFFFFF",
  booked: "#FFFFFF",
  sold: "#FFFFFF",
  blocked: "#6E6E68",
};
/** Ink for the sheet's own annotation layer (roads, dimensions, notes). */
const DRAFT_INK = "#6B5A48";
const BADGE: Record<string, string> = { reserved: "HELD", booked: "BOOKED", sold: "SOLD" };

const MIN_ZOOM = 1;
const MAX_ZOOM = 7;

function pointsOf(ring: [number, number][]) {
  return ring.map((p) => p.join(",")).join(" ");
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function PlanSvg({
  geometry,
  plots,
  selected,
  visible,
  vb,
  survey,
  onPick,
}: {
  geometry: PlotPlanGeometry;
  plots: PlotRow[];
  selected: string | null;
  visible?: Set<string>;
  vb: { x: number; y: number; w: number; h: number };
  /** Survey view restores the approval drawing's own layer colours. */
  survey: boolean;
  onPick: (p: PlotRow) => void;
}) {
  // The road network IS the ground between plots. Flat grey read as empty
  // paper; the sanctioned sheet washes it warm, which is what makes a layout
  // look like a drawing. Survey view keeps the sheet's own stronger ochre.
  const ground = survey ? "#D99F6F" : "#E3CCB2";
  const groundLow = survey ? "#CE8F5D" : "#D9BFA1"; // shaded end of the wash
  const osrFill = survey ? "#E8F0E2" : "#D8E7CC";
  const siteW = survey ? 2.2 : 1.7;
  // Ids must differ per layer state: the mini plan and the full-screen plan are
  // two <Svg> trees in one document on web, and identical ids would collide.
  const gid = survey ? "ground-survey" : "ground-plan";
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Everything inside the sanctioned boundary that is not a plot or the
          OSR is road, exactly as the sheet colours it. */}
      <Defs>
        {/* A whisper of shading across the wash — enough to stop the road
            reading as one flat sheet of colour, not enough to notice. */}
        <LinearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor={ground} />
          <Stop offset="1" stopColor={groundLow} />
        </LinearGradient>
      </Defs>
      <Polygon points={pointsOf(geometry.boundary)} fill={`url(#${gid})`} />
      {geometry.osr?.polygon ? (
        <Polygon points={pointsOf(geometry.osr.polygon)} fill={osrFill} stroke="#5B8C3A" strokeWidth={0.5} strokeDasharray="2.5 1.8" />
      ) : null}
      {geometry.existingRoad?.quad ? (
        <Polygon points={pointsOf(geometry.existingRoad.quad)} fill="#EDE4CC" stroke="#8A7940" strokeWidth={0.5} />
      ) : null}
      {/* Kerb: a pale band laid under the boundary line so the red reads as an
          edge of made ground rather than an outline drawn around a shape. */}
      <Polygon points={pointsOf(geometry.boundary)} fill="none" stroke="#F3E7D8" strokeWidth={siteW + 1.6} strokeLinejoin="round" opacity={0.55} />
      <Polygon points={pointsOf(geometry.boundary)} fill="none" stroke="#C4372A" strokeWidth={siteW} strokeLinejoin="round" />

      {geometry.roads?.map((r, i) => {
        const cx = (r.band[0] + r.band[2]) / 2;
        const cy = (r.band[1] + r.band[3]) / 2;
        return (
          <SvgText key={`road-${i}`} x={cx} y={cy + 1.2} fontSize={3.9} fontWeight="600" letterSpacing={0.35}
            fill={DRAFT_INK} textAnchor="middle"
            transform={r.rotate ? `rotate(${r.rotate} ${cx} ${cy})` : undefined}>
            {r.label}
          </SvgText>
        );
      })}

      {geometry.osr?.polygon && geometry.osr.label ? (
        <G>
          <SvgText x={251} y={327} fontSize={6} fontWeight="800" letterSpacing={0.5} fill="#3F6B27" textAnchor="middle">{geometry.osr.label}</SvgText>
          {geometry.osr.areaSqm ? (
            <SvgText x={251} y={336} fontSize={4} letterSpacing={0.2} fill="#3F6B27" textAnchor="middle">
              {`${geometry.osr.areaSqm.toLocaleString("en-IN")} Sq.m`}
            </SvgText>
          ) : null}
        </G>
      ) : null}

      {geometry.dimensions?.map((d, i) => {
        const rad = Math.atan2(d.to[1] - d.from[1], d.to[0] - d.from[0]);
        const tx = Math.cos(rad + Math.PI / 2) * 2.4;
        const ty = Math.sin(rad + Math.PI / 2) * 2.4;
        const mx = (d.from[0] + d.to[0]) / 2;
        const my = (d.from[1] + d.to[1]) / 2;
        let deg = (rad * 180) / Math.PI;
        if (deg > 90 || deg < -90) deg += 180; // keep the label upright
        return (
          <G key={`dim-${i}`}>
            <Line x1={d.from[0]} y1={d.from[1]} x2={d.to[0]} y2={d.to[1]} stroke={DRAFT_INK} strokeWidth={0.4} opacity={0.75} />
            {[d.from, d.to].map((e, k) => (
              <Line key={k} x1={e[0] - tx} y1={e[1] - ty} x2={e[0] + tx} y2={e[1] + ty} stroke={DRAFT_INK} strokeWidth={0.4} opacity={0.75} />
            ))}
            <SvgText x={mx} y={my - 2.6} fontSize={4} letterSpacing={0.2} fill={DRAFT_INK} textAnchor="middle" transform={`rotate(${deg.toFixed(2)} ${mx} ${my})`}>
              {d.label}
            </SvgText>
          </G>
        );
      })}

      {plots.map((p) => {
        if (!p.poly || !p.at) return null;
        const status = (p.status ?? "available").toLowerCase();
        const isSel = selected === p.plot;
        const dim = visible ? !visible.has(p.plot) : false;
        const [cx, cy] = p.at;
        const badge = BADGE[status];
        return (
          <G key={p.plot} opacity={dim ? 0.18 : 1} onPress={dim ? undefined : () => onPick(p)}>
            <Polygon
              points={pointsOf(p.poly)}
              fill={isSel ? "#2F6BFF" : FILL[status] ?? "#FFFFFF"}
              stroke={isSel ? "#1B4FD8" : survey && status === "available" ? "#1F1F1D" : STROKE[status] ?? "#3B4A40"}
              // Hairline ruling, as drawn on the sheet. The old 0.9 outline was
              // heavy enough to dominate the small cells.
              strokeWidth={isSel ? 2.4 : 0.6}
              strokeLinejoin="miter"
            />
            <SvgText x={cx} y={cy - 0.6} fontSize={7.4} fontWeight="800" fill={isSel ? "#FFFFFF" : survey && status === "available" ? "#1F1F1D" : LABEL[status] ?? "#17241D"} textAnchor="middle">
              {p.plot}
            </SvgText>
            {p.size_sqft ? (
              <SvgText x={cx} y={cy + 5.6} fontSize={2.9} letterSpacing={0.15}
                fill={isSel ? "#EAF0FF" : status === "available" ? "#6E7A70" : "rgba(255,255,255,0.88)"} textAnchor="middle">
                {`${p.size_sqft} ft²`}
              </SvgText>
            ) : null}
            {/* state marks, placed off the label anchor so they stay inside a clipped plot */}
            {badge ? (
              <SvgText x={cx} y={cy + 11.4} fontSize={2.7} fontWeight="700" fill="#FFFFFF" textAnchor="middle">{badge}</SvgText>
            ) : null}
            {status === "booked" || status === "sold" ? (
              <G>
                <Rect x={cx - 2} y={cy - 10.1} width={4} height={3.2} rx={0.7} fill="#FFFFFF" opacity={0.92} />
                <Path d={`M${cx - 1.2} ${cy - 10.1} v-1.1 a1.2 1.2 0 0 1 2.4 0 v1.1`} fill="none" stroke="#FFFFFF" strokeWidth={0.55} />
              </G>
            ) : null}
            {status === "reserved" ? (
              <G>
                <Circle cx={cx} cy={cy - 8.6} r={2} fill="none" stroke="#FFFFFF" strokeWidth={0.55} />
                <Path d={`M${cx} ${cy - 9.8} v1.2 h1.1`} fill="none" stroke="#FFFFFF" strokeWidth={0.55} />
              </G>
            ) : null}
          </G>
        );
      })}

      {/* Edge dimensions, on the SELECTED plot only. Every plot at once would
          be 108 labels on a phone; a surveyor reads the sheet one plot at a
          time and so does a buyer. Lengths are computed from the traced
          geometry × metresPerUnit, not typed in, so they cannot drift from
          the outline actually drawn. */}
      {(() => {
        const sel = plots.find((p) => p.plot === selected);
        const mpu = geometry.metresPerUnit;
        if (!sel?.poly || !sel.at || !mpu) return null;
        const [ccx, ccy] = sel.at;
        return sel.poly.map((pt, i) => {
          const nxt = sel.poly![(i + 1) % sel.poly!.length];
          const dx = nxt[0] - pt[0];
          const dy = nxt[1] - pt[1];
          const metres = Math.hypot(dx, dy) * mpu;
          if (metres < 1) return null; // skip slivers from boundary clipping
          const mx = (pt[0] + nxt[0]) / 2;
          const my = (pt[1] + nxt[1]) / 2;
          let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (deg > 90 || deg < -90) deg += 180; // keep it upright
          // push the label just outside the edge, away from the centroid
          const ox = mx - ccx;
          const oy = my - ccy;
          const n = Math.hypot(ox, oy) || 1;
          const lx = mx + (ox / n) * 2.4;
          const ly = my + (oy / n) * 2.4;
          return (
            <SvgText
              key={`edge-${i}`}
              x={lx}
              y={ly}
              fontSize={3.1}
              fontWeight="700"
              fill="#1B4FD8"
              textAnchor="middle"
              transform={`rotate(${deg.toFixed(1)} ${lx} ${ly})`}
            >
              {metres.toFixed(2)}
            </SvgText>
          );
        });
      })()}

      {geometry.amenities?.map((a, i) =>
        a.at ? (
          <G key={`am-${i}`}>
            <Circle cx={a.at[0]} cy={a.at[1]} r={4.4} fill={colors.surface} stroke={colors.goldDark} strokeWidth={0.7} />
            <SvgText x={a.at[0]} y={a.at[1] + 1.9} fontSize={4.4} fill={colors.goldDark} textAnchor="middle">
              {a.kind === "entrance" ? "⌂" : "❋"}
            </SvgText>
          </G>
        ) : null,
      )}

      {/* Scale bar, sized from the sheet's own overall dimensions so it can
          never disagree with the printed callouts. */}
      {geometry.metresPerUnit ? (
        <G>
          <Rect x={46} y={628} width={10 / geometry.metresPerUnit} height={2.6} fill={colors.ink} />
          <Rect x={46 + 10 / geometry.metresPerUnit} y={628} width={10 / geometry.metresPerUnit} height={2.6} fill="none" stroke={colors.ink} strokeWidth={0.4} />
          {[0, 1, 2].map((k) => (
            <SvgText key={k} x={46 + (10 / geometry.metresPerUnit!) * k} y={626.4} fontSize={3.4} fill={colors.inkFaint} textAnchor="middle">
              {String(k * 10)}
            </SvgText>
          ))}
          <SvgText x={46 + 10 / geometry.metresPerUnit} y={634.4} fontSize={3.4} fill={colors.inkFaint} textAnchor="middle">metres</SvgText>
        </G>
      ) : null}
    </Svg>
  );
}

/** North point and the sheet's scale note, as drawing chrome over the plan. */
function PlanChrome({ scale }: { scale?: string }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 10, top: 10, alignItems: "center", gap: 5 }}>
      <Svg width={20} height={34} viewBox="0 0 24 40">
        <Circle cx={12} cy={30} r={6.5} fill="none" stroke={colors.ink} strokeWidth={1.1} />
        <SvgText x={12} y={33} fontSize={8} fontWeight="700" fill={colors.ink} textAnchor="middle">N</SvgText>
        <Polygon points="12,2 17,20 12,16" fill={colors.ink} />
        <Polygon points="12,2 7,20 12,16" fill="none" stroke={colors.ink} strokeWidth={1.2} />
      </Svg>
      {scale ? (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 0.6, color: colors.inkFaint }}>{scale}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function PlotPlan({
  geometry,
  plots,
  height = 380,
  visible,
  onSelect,
}: {
  geometry: PlotPlanGeometry;
  plots: PlotRow[];
  height?: number;
  /** Plot numbers to keep prominent; everything else dims. Undefined = all. */
  visible?: Set<string>;
  onSelect?: (p: PlotRow) => void;
}) {
  const base = geometry.viewBox;
  const fit = () => ({ x: base[0], y: base[1], w: base[2], h: base[3] });
  const [vb, setVb] = useState(fit);
  const [full, setFull] = useState(false);
  const [survey, setSurvey] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const start = useRef(vb);
  const pinch = useRef<{ dist: number; w: number; h: number; x: number; y: number } | null>(null);
  const size = useRef({ w: 1, h: 1 });
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();

  const pan = useMemo(
    () =>
      PanResponder.create({
        // let taps through to the plots; only take over once it is clearly a drag
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          start.current = vb;
          pinch.current = null;
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            const [a, b] = touches;
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (!pinch.current) {
              pinch.current = { dist, w: vb.w, h: vb.h, x: vb.x, y: vb.y };
              return;
            }
            const p = pinch.current;
            const ratio = Math.max(0.05, p.dist / Math.max(dist, 1));
            const w = clamp(p.w * ratio, base[2] / MAX_ZOOM, base[2] / MIN_ZOOM);
            const h = w * (base[3] / base[2]);
            setVb({ x: p.x + (p.w - w) / 2, y: p.y + (p.h - h) / 2, w, h });
            return;
          }
          pinch.current = null;
          const s = start.current;
          const ux = (g.dx / Math.max(size.current.w, 1)) * s.w;
          const uy = (g.dy / Math.max(size.current.h, 1)) * s.h;
          setVb({ ...s, x: s.x - ux, y: s.y - uy });
        },
        onPanResponderRelease: () => {
          pinch.current = null;
        },
      }),
    [vb, base],
  );

  function zoomBy(factor: number) {
    setVb((v) => {
      const w = clamp(v.w / factor, base[2] / MAX_ZOOM, base[2] / MIN_ZOOM);
      const h = w * (base[3] / base[2]);
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  }

  function pick(p: PlotRow) {
    setSelected(p.plot);
    onSelect?.(p);
  }

  const zoomed = vb.w < base[2] - 0.5;

  const body = (h: number) => (
    <View
      style={{ height: h, borderRadius: full ? 0 : 16, overflow: "hidden", backgroundColor: "#FCFCFA", borderWidth: full ? 0 : 1, borderColor: colors.border }}
      onLayout={(e) => {
        size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
      }}
      {...pan.panHandlers}
    >
      <PlanSvg geometry={geometry} plots={plots} selected={selected} visible={visible} vb={vb} survey={survey} onPick={pick} />
      <PlanChrome scale={geometry.scale} />

      {/* Survey view puts the drawing back into its own layer colours, so the
          plan can be checked against the approved sheet at a glance. */}
      <Pressable
        onPress={() => setSurvey((v) => !v)}
        style={{
          position: "absolute", left: 10, top: 10, flexDirection: "row", alignItems: "center", gap: 7,
          backgroundColor: colors.surface, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
          borderColor: survey ? colors.gold : colors.border,
        }}
      >
        <Ionicons name={survey ? "checkbox" : "square-outline"} size={13} color={survey ? colors.goldDark : colors.inkFaint} />
        <Text style={{ fontSize: 11, fontWeight: "600", color: survey ? colors.goldDark : colors.inkFaint }}>Survey view</Text>
      </Pressable>

      <View style={{ position: "absolute", left: 10, bottom: 10, gap: 6 }}>
        <Pressable onPress={() => zoomBy(1.4)} style={stepStyle}><Ionicons name="add" size={17} color={colors.ink} /></Pressable>
        <Pressable onPress={() => zoomBy(1 / 1.4)} style={stepStyle}><Ionicons name="remove" size={17} color={colors.ink} /></Pressable>
      </View>

      <View style={{ position: "absolute", right: 10, bottom: 10, gap: 6 }}>
        {zoomed ? (
          <Pressable onPress={() => setVb(fit())} style={pillStyle}>
            <Ionicons name="contract" size={13} color="#fff" />
            <Text style={pillText}>Fit</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setFull((v) => !v)} style={pillStyle}>
          <Ionicons name={full ? "close" : "expand"} size={13} color="#fff" />
          <Text style={pillText}>{full ? "Close" : "Full"}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View>
      {body(height)}
      <Text style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 8, lineHeight: 17 }}>
        Pinch to zoom, drag to pan, tap any plot for its details. Plan traced from the sanctioned
        approval drawing{geometry.approvalNo ? ` (${geometry.approvalNo})` : ""}; sizes are quoted
        from the plot schedule.
      </Text>

      {/* Full screen reuses the same body, so pan/zoom state carries across. */}
      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: "#FCFCFA", paddingTop: insets.top, paddingBottom: insets.bottom }}>
          {body(win.height - insets.top - insets.bottom)}
        </View>
      </Modal>
    </View>
  );
}

const stepStyle = {
  width: 34,
  height: 34,
  borderRadius: 10,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
};

const pillStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 5,
  backgroundColor: "rgba(0,0,0,0.62)",
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
};
const pillText = { color: "#fff", fontSize: 11.5, fontWeight: "700" as const };

/** Colour key for the plan. */
export function PlotLegend() {
  const items: [string, string][] = [
    ["available", "Available"],
    ["reserved", "On hold"],
    ["booked", "Booked"],
    ["sold", "Sold"],
    ["blocked", "Not released"],
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, paddingTop: 2 }}>
      {items.map(([k, label]) => (
        <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 13, height: 13, borderRadius: 4, backgroundColor: FILL[k], borderWidth: 1.4, borderColor: STROKE[k] }} />
          <Text style={{ fontSize: 11.5, color: colors.inkFaint }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Availability totals across the schedule. */
export function PlotTotals({ plots }: { plots: PlotRow[] }) {
  const counts = plots.reduce((a, p) => {
    const s = (p.status ?? "available").toLowerCase();
    a[s] = (a[s] ?? 0) + 1;
    return a;
  }, {} as Record<string, number>);
  const defs: [string, string][] = [
    ["available", "Available"],
    ["reserved", "On hold"],
    ["booked", "Booked"],
    ["sold", "Sold"],
    ["blocked", "Not released"],
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      <View style={totalBox()}>
        <Text style={[totalNum, { color: colors.ink }]}>{plots.length}</Text>
        <Text style={totalLabel()}>Total plots</Text>
      </View>
      {defs.map(([k, label]) =>
        counts[k] ? (
          <View key={k} style={totalBox()}>
            <Text style={[totalNum, { color: STROKE[k] ?? colors.ink }]}>{counts[k]}</Text>
            <Text style={totalLabel()}>{label}</Text>
          </View>
        ) : null,
      )}
    </ScrollView>
  );
}

/**
 * The sheet's title block.
 *
 * Every approval drawing carries one: who approved it, under which
 * application, at what scale, over which survey numbers. Without it the plan
 * is a picture; with it, it is a document a buyer can check against the
 * sanctioned sheet. Every field is read from properties.plot_plan — nothing is
 * hardcoded, so editing the property in admin updates this.
 */
export function PlotTitleBlock({
  geometry, title, shareUrl,
}: { geometry: PlotPlanGeometry; title?: string | null; shareUrl?: string | null }) {
  const rows: [string, string][] = [];
  if (geometry.surveyNos) rows.push(["Survey nos.", geometry.surveyNos]);
  if (geometry.village || geometry.taluk) {
    rows.push(["Village / Taluk", [geometry.village, geometry.taluk].filter(Boolean).join(" / ")]);
  }
  if (geometry.authority) rows.push(["Approving authority", geometry.authority]);
  if (geometry.approvalNo) rows.push(["Application no.", geometry.approvalNo]);
  if (geometry.scale) rows.push(["Scale", geometry.scale]);
  if (geometry.totalPlots) rows.push(["Total plots", String(geometry.totalPlots)]);
  // The sheet stores this as an array of {label, area} rows, so each becomes
  // its own line. A plain string is still accepted. Rendering the array
  // directly would have printed "[object Object]".
  const area = geometry.areaStatement;
  if (typeof area === "string" && area.trim()) {
    rows.push(["Area", area]);
  } else if (Array.isArray(area)) {
    area.forEach((a) => {
      if (a?.label && a?.area != null) rows.push([String(a.label), String(a.area)]);
    });
  }
  if (!rows.length) return null;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, overflow: "hidden" }}>
      <View style={{ backgroundColor: colors.surfaceSunken, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontSize: 9.5, fontWeight: "800", letterSpacing: 1, color: colors.inkFaint, textTransform: "uppercase" }}>
          Approved layout — title block
        </Text>
        {title ? (
          <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.ink, marginTop: 2 }} numberOfLines={2}>{title}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 4 }}>
          {rows.map(([k, v], i) => (
            <View
              key={k}
              style={{
                flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 7,
                borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border,
              }}
            >
              <Text style={{ flex: 1, fontSize: 11.5, color: colors.inkFaint }}>{k}</Text>
              <Text style={{ flex: 1.35, fontSize: 11.5, fontWeight: "700", color: colors.ink, textAlign: "right" }}>{v}</Text>
            </View>
          ))}
        </View>
        {shareUrl ? (
          <View style={{ width: 96, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderLeftWidth: 1, borderColor: colors.border }}>
            <View style={{ backgroundColor: "#fff", padding: 5, borderRadius: 8 }}>
              <QRCode value={shareUrl} size={62} />
            </View>
            <Text style={{ fontSize: 9, color: colors.inkFaint, marginTop: 6, textAlign: "center" }}>Scan for{"\n"}this layout</Text>
          </View>
        ) : null}
      </View>
      {geometry.notes ? (
        <Text style={{ fontSize: 10.5, color: colors.inkFaint, paddingHorizontal: 12, paddingBottom: 10, lineHeight: 15 }}>
          {geometry.notes}
        </Text>
      ) : null}
    </View>
  );
}

const totalBox = () => ({
  minWidth: 88,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: colors.surface,
});
const totalNum = { fontSize: 19, fontWeight: "800" as const };
const totalLabel = () => ({ fontSize: 10.5, color: colors.inkFaint, textTransform: "uppercase" as const, letterSpacing: 0.4 });