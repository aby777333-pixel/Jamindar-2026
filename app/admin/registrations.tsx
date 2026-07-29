import { useMemo, useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";
import { useAdminGate } from "@/components/AdminGate";

interface Row {
  user_id: string | null;
  name: string;
  role: string;
  mobile: string | null;
  registered_at: string;
  bought: boolean;
}

type SortKey = "date" | "name" | "buy";
const PAGE = 25;

/** Registration Details (report 28-07) — opened from the dashboard's
 *  Total Users / Buyers cards. Search, sorting and pagination are client-side
 *  over the admin_registration_details() RPC result. */
export default function AdminRegistrations() {
  const router = useRouter();
  // Bug report #8: the dashboard's Buyers/Promoters cards must show only that
  // role — they pass ?role=… ; without the param this stays the full list.
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-registrations"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("admin_registration_details", { p_limit: 500 });
      if (error) throw error;
      return (data as Row[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = data ?? [];
    if (roleParam) rows = rows.filter((r) => r.role === roleParam);
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.user_id ?? "").toLowerCase().includes(q) ||
          (r.mobile ?? "").includes(q)
      );
    }
    const dir = asc ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name) * dir;
      if (sort === "buy") return (Number(a.bought) - Number(b.bought)) * dir;
      return (new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()) * dir;
    });
    return rows;
  }, [data, search, sort, asc, roleParam]);

  const adminGate = useAdminGate();
  if (adminGate) return adminGate;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  function toggleSort(k: SortKey) {
    if (sort === k) setAsc((v) => !v);
    else {
      setSort(k);
      setAsc(k === "name");
    }
    setPage(0);
  }

  const sortChip = (k: SortKey, label: string) => (
    <Pressable
      key={k}
      onPress={() => toggleSort(k)}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: sort === k ? colors.ink : colors.surface, borderWidth: 1, borderColor: sort === k ? colors.ink : colors.border }}
    >
      <Text style={{ color: sort === k ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: 12 }}>{label}</Text>
      {sort === k ? <Ionicons name={asc ? "arrow-up" : "arrow-down"} size={12} color="#fff" /> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>
            {roleParam ? `${roleParam.charAt(0).toUpperCase()}${roleParam.slice(1).replace(/_/g, " ")}s` : "Registration Details"}
          </Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
            {filtered.length} registered {roleParam ? `${roleParam.replace(/_/g, " ")}${filtered.length === 1 ? "" : "s"}` : filtered.length === 1 ? "user" : "users"}
          </Text>
        </View>
      </View>

      {/* search + sort */}
      <View style={{ paddingHorizontal: space.md, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={16} color={colors.inkFaint} />
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setPage(0);
            }}
            placeholder="Search name, user ID or mobile…"
            placeholderTextColor={colors.inkFaint}
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: colors.ink, fontSize: 13.5 }}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {sortChip("date", "Registration date")}
          {sortChip("name", "Name")}
          {sortChip("buy", "Buy status")}
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : slice.length === 0 ? (
        <Empty title="No registrations found" subtitle={search ? "Try a different search." : undefined} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 30, gap: 8 }} showsVerticalScrollIndicator={false}>
          {slice.map((r, i) => (
            <Card key={`${r.user_id}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}>
              <Text style={{ width: 30, color: colors.inkFaint, fontWeight: "700", fontSize: 12 }}>{safePage * PAGE + i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 14 }} numberOfLines={1}>{r.name}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 11.5 }} numberOfLines={1}>
                  {[r.user_id, r.role, new Date(r.registered_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <View style={{ backgroundColor: r.bought ? colors.successSoft : colors.surfaceSunken, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: r.bought ? colors.success : colors.inkFaint }}>
                  {r.bought ? "Bought: Yes" : "Bought: No"}
                </Text>
              </View>
            </Card>
          ))}

          {/* pagination */}
          {pages > 1 ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 6 }}>
              <Pressable disabled={safePage === 0} onPress={() => setPage(safePage - 1)} style={{ opacity: safePage === 0 ? 0.35 : 1, padding: 8 }}>
                <Ionicons name="chevron-back" size={20} color={colors.ink} />
              </Pressable>
              <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: 13 }}>
                Page {safePage + 1} of {pages}
              </Text>
              <Pressable disabled={safePage >= pages - 1} onPress={() => setPage(safePage + 1)} style={{ opacity: safePage >= pages - 1 ? 0.35 : 1, padding: 8 }}>
                <Ionicons name="chevron-forward" size={20} color={colors.ink} />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
