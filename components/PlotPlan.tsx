import { Ionicons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import Svg, { G, Line, Polygon, Rect, Text as SvgText } from "react-native-svg";

import { colors } from "../lib/theme";

/**
 * Interactive DTCP site plan.
 *
 * The plan is drawn from geometry traced out of the sanctioned approval drawing,
 * so it can be checked against the legal sheet rather than redrawn by eye. Every
 * quoted size and area comes from the plot schedule (`plot_layout`), never from
 * these coordinates — the drawn rectangles are set out to fill each row band and
 * read a little off the quoted metres.
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
  metresPerUnit?: number;
  approvalNo?: string;
  scale?: string;
}

const FILL: Record<string, string> = {
  available: "#FFFFFF",
  reserved: colors.gold,
  booked: "#D93025",
  sold: "#4A4A4A",
  blocked: "#E6E7E2",
};
const STROKE: Record<string, string> = {
  available: colors.success,
  reserved: colors.goldDark,
  booked: "#A61B10",
  sold: "#2E2E2E",
  blocked: colors.inkFaint,
};
const LABEL: Record<string, string> = {
  available: colors.success,
  reserved: "#FFFFFF",
  booked: "#FFFFFF",
  sold: "#FFFFFF",
  blocked: colors.inkFaint,
};
const STATUS_TEXT: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  booked: "Booked",
  sold: "Sold",
  blocked: "Not released",
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 7;

function pointsOf(ring: [number, number][]) {
  return ring.map((p) => p.join(",")).join(" ");
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function PlotPlan({
  geometry,
  plots,
  height = 380,
  onSelect,
}: {
  geometry: PlotPlanGeometry;
  plots: PlotRow[];
  height?: number;
  onSelect?: (p: PlotRow) => void;
}) {
  const base = geometry.viewBox;
  const [vb, setVb] = useState({ x: base[0], y: base[1], w: base[2], h: base[3] });
  const [selected, setSelected] = useState<string | null>(null);
  const start = useRef(vb);
  const pinch = useRef<{ dist: number; w: number; h: number; x: number; y: number } | null>(null);
  const size = useRef({ w: 1, h: 1 });

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

  const zoomed = vb.w < base[2] - 0.5;

  return (
    <View>
      <View
        style={{ height, borderRadius: 16, overflow: "hidden", backgroundColor: "#FCFCFA", borderWidth: 1, borderColor: colors.border }}
        onLayout={(e) => {
          size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        {...pan.panHandlers}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Everything inside the sanctioned boundary that is not a plot or the
              OSR is road, exactly as the sheet colours it. */}
          <Polygon points={pointsOf(geometry.boundary)} fill="#ECECE8" />
          {geometry.osr?.polygon ? (
            <Polygon
              points={pointsOf(geometry.osr.polygon)}
              fill="#EEF5EA"
              stroke="#5B8C3A"
              strokeWidth={0.5}
              strokeDasharray="2.5 1.8"
            />
          ) : null}
          {geometry.existingRoad?.quad ? (
            <Polygon points={pointsOf(geometry.existingRoad.quad)} fill="#F4EFDC" stroke="#7A6B32" strokeWidth={0.6} />
          ) : null}
          <Polygon
            points={pointsOf(geometry.boundary)}
            fill="none"
            stroke="#D0402F"
            strokeWidth={1.9}
            strokeLinejoin="round"
          />

          {geometry.roads?.map((r, i) => {
            const cx = (r.band[0] + r.band[2]) / 2;
            const cy = (r.band[1] + r.band[3]) / 2;
            return (
              <SvgText
                key={`road-${i}`}
                x={cx}
                y={cy + 1.2}
                fontSize={4}
                fill={colors.inkFaint}
                textAnchor="middle"
                transform={r.rotate ? `rotate(${r.rotate} ${cx} ${cy})` : undefined}
              >
                {r.label}
              </SvgText>
            );
          })}

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
                <Line x1={d.from[0]} y1={d.from[1]} x2={d.to[0]} y2={d.to[1]} stroke={colors.inkFaint} strokeWidth={0.5} opacity={0.6} />
                {[d.from, d.to].map((e, k) => (
                  <Line key={k} x1={e[0] - tx} y1={e[1] - ty} x2={e[0] + tx} y2={e[1] + ty} stroke={colors.inkFaint} strokeWidth={0.5} opacity={0.6} />
                ))}
                <SvgText x={mx} y={my - 2.6} fontSize={4.2} fill={colors.inkFaint} textAnchor="middle" transform={`rotate(${deg.toFixed(2)} ${mx} ${my})`}>
                  {d.label}
                </SvgText>
              </G>
            );
          })}

          {plots.map((p) => {
            if (!p.poly || !p.at) return null;
            const status = (p.status ?? "available").toLowerCase();
            const isSel = selected === p.plot;
            const [cx, cy] = p.at;
            return (
              <G
                key={p.plot}
                onPress={() => {
                  setSelected(p.plot);
                  onSelect?.(p);
                }}
              >
                <Polygon
                  points={pointsOf(p.poly)}
                  fill={isSel ? "#2F6BFF" : FILL[status] ?? "#FFFFFF"}
                  stroke={isSel ? "#1B4FD8" : STROKE[status] ?? colors.success}
                  strokeWidth={isSel ? 2.2 : 0.9}
                />
                <SvgText
                  x={cx}
                  y={cy - 0.8}
                  fontSize={6.6}
                  fontWeight="700"
                  fill={isSel ? "#FFFFFF" : LABEL[status] ?? colors.success}
                  textAnchor="middle"
                >
                  {p.plot}
                </SvgText>
                {p.size_sqft ? (
                  <SvgText
                    x={cx}
                    y={cy + 6}
                    fontSize={3.1}
                    fill={isSel ? "#FFFFFF" : status === "available" ? colors.inkFaint : "rgba(255,255,255,0.85)"}
                    textAnchor="middle"
                  >
                    {`${p.size_sqft} ft²`}
                  </SvgText>
                ) : null}
              </G>
            );
          })}

          {/* Scale bar, sized from the sheet's own overall dimensions so it can
              never disagree with the printed callouts. */}
          {geometry.metresPerUnit ? (
            <G>
              <Rect x={46} y={628} width={10 / geometry.metresPerUnit} height={2.6} fill={colors.ink} />
              <Rect
                x={46 + 10 / geometry.metresPerUnit}
                y={628}
                width={10 / geometry.metresPerUnit}
                height={2.6}
                fill="none"
                stroke={colors.ink}
                strokeWidth={0.4}
              />
              {[0, 1, 2].map((k) => (
                <SvgText key={k} x={46 + (10 / geometry.metresPerUnit!) * k} y={626.4} fontSize={3.4} fill={colors.inkFaint} textAnchor="middle">
                  {String(k * 10)}
                </SvgText>
              ))}
              <SvgText x={46 + 10 / geometry.metresPerUnit} y={634.4} fontSize={3.4} fill={colors.inkFaint} textAnchor="middle">
                metres
              </SvgText>
            </G>
          ) : null}
        </Svg>

        {zoomed ? (
          <Pressable
            onPress={() => setVb({ x: base[0], y: base[1], w: base[2], h: base[3] })}
            style={{
              position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: "rgba(0,0,0,0.62)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
            }}
          >
            <Ionicons name="contract" size={13} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 11.5, fontWeight: "700" }}>Fit plan</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 8, lineHeight: 17 }}>
        Pinch to zoom, drag to pan, tap any plot for its details. Plan traced from the sanctioned
        approval drawing{geometry.approvalNo ? ` (${geometry.approvalNo})` : ""}; sizes are quoted
        from the plot schedule.
      </Text>
    </View>
  );
}

/** Compact detail card for the tapped plot. */
export function PlotDetailCard({ plot }: { plot: PlotRow }) {
  const status = (plot.status ?? "available").toLowerCase();
  const rows: [string, string][] = [
    ["Plot", plot.plot],
    ...(plot.block ? ([["Block", plot.block]] as [string, string][]) : []),
    ...(plot.size_sqft ? ([["Area", `${plot.size_sqft.toLocaleString("en-IN")} ft²`]] as [string, string][]) : []),
    ...(plot.size_sqm ? ([["Area (m²)", `${plot.size_sqm} m²`]] as [string, string][]) : []),
    ...(plot.dim_m ? ([["Dimensions", `${plot.dim_m} m`]] as [string, string][]) : []),
    ...(plot.facing ? ([["Facing", plot.facing]] as [string, string][]) : []),
    ["Status", STATUS_TEXT[status] ?? status],
  ];
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, backgroundColor: colors.surface, gap: 2 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
          <Text style={{ fontSize: 12.5, color: colors.inkFaint }}>{k}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: k === "Status" ? (STROKE[status] ?? colors.ink) : colors.ink }}>{v}</Text>
        </View>
      ))}
      <Text style={{ fontSize: 10.5, color: colors.inkFaint, marginTop: 6, lineHeight: 15 }}>
        Facing is read from the plan and is not part of the DTCP approval.
      </Text>
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
    ["reserved", "Reserved"],
    ["booked", "Booked"],
    ["sold", "Sold"],
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {defs.map(([k, label]) =>
        counts[k] ? (
          <View key={k} style={{ minWidth: 84, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: STROKE[k] ?? colors.ink }}>{counts[k]}</Text>
            <Text style={{ fontSize: 11, color: colors.inkFaint }}>{label}</Text>
          </View>
        ) : null,
      )}
    </ScrollView>
  );
}
