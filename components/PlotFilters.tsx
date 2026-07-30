import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { colors } from "../lib/theme";
import type { PlotRow } from "./PlotPlan";

/**
 * Buyer-side filters over the plot schedule.
 *
 * Every control is built from the data that is actually present: facings and
 * road widths come from the schedule, budget only appears once the layout is
 * priced, and the corner filter stays hidden until an admin has flagged a
 * corner plot. That way the bar never offers a filter that can only return
 * nothing.
 */

export interface PlotFilterState {
  q: string;
  status: string | null;
  facing: string | null;
  road: number | null;
  maxBudget: number | null;
  minSqft: number | null;
  cornerOnly: boolean;
}

export const EMPTY_FILTERS: PlotFilterState = {
  q: "",
  status: null,
  facing: null,
  road: null,
  maxBudget: null,
  minSqft: null,
  cornerOnly: false,
};

function price(p: PlotRow): number | null {
  const v = p.offer_price ?? p.price;
  const n = v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Plot numbers that survive the filters. */
export function applyPlotFilters(plots: PlotRow[], f: PlotFilterState): Set<string> {
  const q = f.q.trim().toLowerCase();
  const out = new Set<string>();
  for (const p of plots) {
    if (f.status && (p.status ?? "available").toLowerCase() !== f.status) continue;
    if (f.facing && (p.facing ?? "").toLowerCase() !== f.facing.toLowerCase()) continue;
    if (f.road && Number(p.road_m) !== f.road) continue;
    if (f.cornerOnly && !p.corner) continue;
    if (f.minSqft && Number(p.size_sqft ?? 0) < f.minSqft) continue;
    if (f.maxBudget) {
      const v = price(p);
      if (v === null || v > f.maxBudget) continue;
    }
    if (q) {
      const hay = [
        `plot ${p.plot}`,
        p.block ? `block ${p.block}` : "",
        p.facing ?? "",
        price(p)?.toString() ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.add(p.plot);
  }
  return out;
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderColor: active ? colors.gold : colors.border,
        backgroundColor: active ? colors.goldSoft : colors.surface,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: active ? "700" : "500", color: active ? colors.goldDark : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

export function PlotFilters({
  plots,
  value,
  onChange,
  matched,
}: {
  plots: PlotRow[];
  value: PlotFilterState;
  onChange: (f: PlotFilterState) => void;
  matched: number;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<PlotFilterState>) => onChange({ ...value, ...patch });

  // Only offer what the data can actually answer.
  const facings = useMemo(
    () => Array.from(new Set(plots.map((p) => p.facing).filter(Boolean) as string[])).sort(),
    [plots],
  );
  const roads = useMemo(
    () => Array.from(new Set(plots.map((p) => Number(p.road_m)).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b),
    [plots],
  );
  const statuses = useMemo(
    () => Array.from(new Set(plots.map((p) => (p.status ?? "available").toLowerCase()))).sort(),
    [plots],
  );
  const hasPricing = useMemo(() => plots.some((p) => price(p) !== null), [plots]);
  const hasCorners = useMemo(() => plots.some((p) => p.corner), [plots]);

  const active =
    !!value.q || !!value.status || !!value.facing || !!value.road || !!value.maxBudget || !!value.minSqft || value.cornerOnly;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.surface }}>
          <Ionicons name="search" size={15} color={colors.inkFaint} />
          <TextInput
            value={value.q}
            onChangeText={(q) => set({ q })}
            placeholder="Plot number, block or price"
            placeholderTextColor={colors.inkFaint}
            style={{ flex: 1, paddingVertical: 10, fontSize: 13.5, color: colors.ink }}
            returnKeyType="search"
          />
          {value.q ? (
            <Pressable onPress={() => set({ q: "" })} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.inkFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: active ? colors.gold : colors.border, backgroundColor: active ? colors.goldSoft : colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <Ionicons name="options-outline" size={15} color={active ? colors.goldDark : colors.ink} />
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? colors.goldDark : colors.ink }}>Filter</Text>
        </Pressable>
      </View>

      {open ? (
        <View style={{ gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, backgroundColor: colors.surfaceAlt }}>
          {statuses.length > 1 ? (
            <FilterRow label="Availability">
              {statuses.map((s) => (
                <Pill key={s} label={s[0].toUpperCase() + s.slice(1)} active={value.status === s} onPress={() => set({ status: value.status === s ? null : s })} />
              ))}
            </FilterRow>
          ) : null}

          {facings.length > 1 ? (
            <FilterRow label="Facing">
              {facings.map((f) => (
                <Pill key={f} label={f} active={value.facing === f} onPress={() => set({ facing: value.facing === f ? null : f })} />
              ))}
            </FilterRow>
          ) : null}

          {roads.length > 1 ? (
            <FilterRow label="Road width">
              {roads.map((r) => (
                <Pill key={r} label={`${r.toFixed(2)} m`} active={value.road === r} onPress={() => set({ road: value.road === r ? null : r })} />
              ))}
            </FilterRow>
          ) : null}

          <FilterRow label="Minimum area">
            {[2000, 2200, 2400, 2500].map((a) => (
              <Pill key={a} label={`${a.toLocaleString("en-IN")}+ ft²`} active={value.minSqft === a} onPress={() => set({ minSqft: value.minSqft === a ? null : a })} />
            ))}
          </FilterRow>

          {hasPricing ? (
            <FilterRow label="Max budget">
              {[1500000, 2500000, 4000000, 6000000].map((b) => (
                <Pill key={b} label={`₹${(b / 100000).toFixed(0)} L`} active={value.maxBudget === b} onPress={() => set({ maxBudget: value.maxBudget === b ? null : b })} />
              ))}
            </FilterRow>
          ) : null}

          {hasCorners ? (
            <FilterRow label="Corner">
              <Pill label="Corner plots only" active={value.cornerOnly} onPress={() => set({ cornerOnly: !value.cornerOnly })} />
            </FilterRow>
          ) : null}

          {!hasPricing ? (
            <Text style={{ fontSize: 11, color: colors.inkFaint, lineHeight: 16 }}>
              Budget filtering appears once this layout is priced.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, color: colors.inkFaint }}>
          {matched} of {plots.length} plots
        </Text>
        {active ? (
          <Pressable onPress={() => onChange(EMPTY_FILTERS)} hitSlop={8}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.goldDark }}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.inkFaint }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {children}
      </ScrollView>
    </View>
  );
}
