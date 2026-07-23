import { useEffect, useState } from "react";
import { Text, View, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Loading } from "@/components/ui";
import { Field } from "@/components/Field";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { PROPERTY_TYPE_LABELS, type Property, type PropertyType, type PropertyStatus, type ProjectPhase } from "@/lib/types";

const TYPES = Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[];
const STATUSES: PropertyStatus[] = ["draft", "available", "reserved", "sold", "archived"];
const PHASES: ProjectPhase[] = ["ongoing", "current", "future"];
const APPROVALS = ["dtcp", "rera", "cmda", "panchayat", "clear_title"];

const linesToArr = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const arrToLines = (a?: any[]) => (a ?? []).join("\n");
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export default function PropertyEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const editing = !!id;
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState({
    title: "", property_type: "residential_plot" as PropertyType, status: "draft" as PropertyStatus, project_phase: "current" as ProjectPhase,
    is_featured: false, price: "", area_value: "", area_unit: "sqft", plots_total: "", plots_available: "",
    city: "", district: "", state: "", locality: "", pincode: "", lat: "", lng: "", gmaps_url: "",
    description: "", vastu_facing: "",
    images: "", videos: "", drone_videos: "", brochure_url: "", virtual_tour_url: "", master_plan_url: "",
    amenities: "", approvals: {} as Record<string, boolean>,
    rera_number: "", street_view_url: "", google_earth_url: "",
    legal_ownership: "", legal_encumbrance: "", legal_notes: "",
    inv_roi: "", inv_rental_yield: "", inv_appreciation: "",
    documents: "", nearby_places: "",
  });
  const set = (k: keyof typeof f) => (v: any) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!id) return;
    supabase.from("properties").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      const p = data as Property | null;
      if (p) {
        setF({
          title: p.title ?? "", property_type: p.property_type, status: p.status, project_phase: p.project_phase,
          is_featured: !!p.is_featured, price: p.price?.toString() ?? "", area_value: p.area_value?.toString() ?? "",
          area_unit: p.area_unit ?? "sqft", plots_total: p.plots_total?.toString() ?? "", plots_available: p.plots_available?.toString() ?? "",
          city: p.city ?? "", district: p.district ?? "", state: p.state ?? "", locality: p.locality ?? "", pincode: p.pincode ?? "",
          lat: p.lat?.toString() ?? "", lng: p.lng?.toString() ?? "", gmaps_url: p.gmaps_url ?? "",
          description: p.description ?? "", vastu_facing: p.vastu_facing ?? "",
          images: arrToLines(p.images), videos: arrToLines(p.videos), drone_videos: arrToLines(p.drone_videos),
          brochure_url: p.brochure_url ?? "", virtual_tour_url: p.virtual_tour_url ?? "", master_plan_url: p.master_plan_url ?? "",
          amenities: (p.amenities ?? []).join(", "), approvals: p.approvals ?? {},
          rera_number: p.rera_number ?? "", street_view_url: p.street_view_url ?? "", google_earth_url: p.google_earth_url ?? "",
          legal_ownership: p.legal?.ownership ?? "", legal_encumbrance: p.legal?.encumbrance ?? "", legal_notes: p.legal?.notes ?? "",
          inv_roi: p.investment?.roi?.toString() ?? "", inv_rental_yield: p.investment?.rental_yield?.toString() ?? "", inv_appreciation: p.investment?.appreciation?.toString() ?? "",
          documents: (p.documents ?? []).map((d) => `${d.label}|${d.url}${d.size ? "|" + d.size : ""}`).join("\n"),
          nearby_places: (p.nearby_places ?? []).map((n) => `${n.name}|${n.distance ?? ""}${n.duration ? "|" + n.duration : ""}`).join("\n"),
        });
      }
      setLoading(false);
    });
  }, [id]);

  async function save() {
    if (f.title.trim().length < 3) { Alert.alert("Title required", "Please enter a property title."); return; }
    setSaving(true);
    try {
      const legal: Record<string, string> = {};
      if (f.legal_ownership.trim()) legal.ownership = f.legal_ownership.trim();
      if (f.legal_encumbrance.trim()) legal.encumbrance = f.legal_encumbrance.trim();
      if (f.legal_notes.trim()) legal.notes = f.legal_notes.trim();
      const investment: Record<string, unknown> = {};
      if (f.inv_roi.trim()) investment.roi = f.inv_roi.trim();
      if (f.inv_rental_yield.trim()) investment.rental_yield = f.inv_rental_yield.trim();
      if (f.inv_appreciation.trim()) investment.appreciation = f.inv_appreciation.trim();
      const documents = linesToArr(f.documents).map((l) => { const [label, url, size] = l.split("|").map((x) => x.trim()); return { label, url, ...(size ? { size } : {}) }; }).filter((d) => d.url);
      const nearby_places = linesToArr(f.nearby_places).map((l) => { const [name, distance, duration] = l.split("|").map((x) => x.trim()); return { name, ...(distance ? { distance } : {}), ...(duration ? { duration } : {}) }; }).filter((n) => n.name);

      const payload: Record<string, unknown> = {
        title: f.title.trim(), property_type: f.property_type, status: f.status, project_phase: f.project_phase,
        is_featured: f.is_featured, price: numOrNull(f.price), area_value: numOrNull(f.area_value), area_unit: f.area_unit,
        plots_total: numOrNull(f.plots_total), plots_available: numOrNull(f.plots_available),
        city: f.city.trim() || null, district: f.district.trim() || null, state: f.state.trim() || null, locality: f.locality.trim() || null, pincode: f.pincode.trim() || null,
        lat: numOrNull(f.lat), lng: numOrNull(f.lng), gmaps_url: f.gmaps_url.trim() || null,
        description: f.description.trim() || null, vastu_facing: f.vastu_facing.trim() || null,
        images: linesToArr(f.images), videos: linesToArr(f.videos), drone_videos: linesToArr(f.drone_videos),
        brochure_url: f.brochure_url.trim() || null, virtual_tour_url: f.virtual_tour_url.trim() || null, master_plan_url: f.master_plan_url.trim() || null,
        amenities: f.amenities.split(",").map((a) => a.trim()).filter(Boolean), approvals: f.approvals,
        rera_number: f.rera_number.trim() || null, street_view_url: f.street_view_url.trim() || null, google_earth_url: f.google_earth_url.trim() || null,
        legal, investment, documents, nearby_places,
      };

      if (editing) {
        const { error } = await supabase.from("properties").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("properties").insert({ ...payload, created_by: profile?.id ?? null });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["featured-properties"] });
      Alert.alert("Saved", `Property ${editing ? "updated" : "created"}.`, [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>{editing ? "Edit property" : "New property"}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Sec title="Basics">
          <Field label="Title" value={f.title} onChangeText={set("title")} placeholder="Prestige Meadows — Plot 24" />
          <Choice label="Type" options={TYPES.map((t) => ({ k: t, l: PROPERTY_TYPE_LABELS[t] }))} value={f.property_type} onChange={set("property_type")} />
          <Choice label="Status" options={STATUSES.map((s) => ({ k: s, l: s }))} value={f.status} onChange={set("status")} />
          <Choice label="Project phase" options={PHASES.map((s) => ({ k: s, l: s }))} value={f.project_phase} onChange={set("project_phase")} />
          <Toggle label="Featured listing" value={f.is_featured} onChange={set("is_featured")} />
        </Sec>

        <Sec title="Pricing & size">
          <Field label="Price (₹)" value={f.price} onChangeText={set("price")} keyboardType="numeric" placeholder="4250000" />
          <Field label="Area value" value={f.area_value} onChangeText={set("area_value")} keyboardType="numeric" placeholder="2400" />
          <Choice label="Area unit" options={["sqft", "grounds", "acres", "cents", "hectares"].map((u) => ({ k: u, l: u }))} value={f.area_unit} onChange={set("area_unit")} />
          <Field label="Plots total" value={f.plots_total} onChangeText={set("plots_total")} keyboardType="numeric" placeholder="120" />
          <Field label="Plots available" value={f.plots_available} onChangeText={set("plots_available")} keyboardType="numeric" placeholder="45" />
        </Sec>

        <Sec title="Location">
          <Field label="Locality" value={f.locality} onChangeText={set("locality")} placeholder="Sarjapur" />
          <Field label="City" value={f.city} onChangeText={set("city")} placeholder="Bengaluru" />
          <Field label="District" value={f.district} onChangeText={set("district")} />
          <Field label="State" value={f.state} onChangeText={set("state")} placeholder="Karnataka" />
          <Field label="PIN code" value={f.pincode} onChangeText={set("pincode")} keyboardType="number-pad" />
          <Field label="Latitude" value={f.lat} onChangeText={set("lat")} keyboardType="numbers-and-punctuation" />
          <Field label="Longitude" value={f.lng} onChangeText={set("lng")} keyboardType="numbers-and-punctuation" />
          <Field label="Google Maps URL" value={f.gmaps_url} onChangeText={set("gmaps_url")} autoCapitalize="none" />
        </Sec>

        <Sec title="Content">
          <Field label="Description" value={f.description} onChangeText={set("description")} multiline />
          <Field label="Vastu facing" value={f.vastu_facing} onChangeText={set("vastu_facing")} placeholder="East" />
        </Sec>

        <Sec title="Media (one URL per line)">
          <Field label="Images" value={f.images} onChangeText={set("images")} multiline autoCapitalize="none" hint="One image URL per line" />
          <Field label="Videos" value={f.videos} onChangeText={set("videos")} multiline autoCapitalize="none" />
          <Field label="Drone videos" value={f.drone_videos} onChangeText={set("drone_videos")} multiline autoCapitalize="none" />
          <Field label="Brochure URL" value={f.brochure_url} onChangeText={set("brochure_url")} autoCapitalize="none" />
          <Field label="360° tour URL" value={f.virtual_tour_url} onChangeText={set("virtual_tour_url")} autoCapitalize="none" />
          <Field label="Master plan image URL" value={f.master_plan_url} onChangeText={set("master_plan_url")} autoCapitalize="none" />
        </Sec>

        <Sec title="Amenities & approvals">
          <Field label="Amenities (comma separated)" value={f.amenities} onChangeText={set("amenities")} multiline placeholder="Gated Community, Park, Clubhouse" />
          <Text style={{ color: colors.inkSoft, fontWeight: "600", marginBottom: 8, fontSize: 13 }}>Approvals</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {APPROVALS.map((a) => {
              const on = !!f.approvals[a];
              return (
                <Pressable key={a} onPress={() => setF((s) => ({ ...s, approvals: { ...s.approvals, [a]: !on } }))} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? colors.success : colors.surface, borderWidth: 1, borderColor: on ? colors.success : colors.border }}>
                  {on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                  <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 12 }}>{a.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        </Sec>

        <Sec title="Legal & investment">
          <Field label="RERA number" value={f.rera_number} onChangeText={set("rera_number")} autoCapitalize="characters" />
          <Field label="Ownership" value={f.legal_ownership} onChangeText={set("legal_ownership")} placeholder="Clear / freehold" />
          <Field label="Encumbrance" value={f.legal_encumbrance} onChangeText={set("legal_encumbrance")} placeholder="Nil" />
          <Field label="Legal notes" value={f.legal_notes} onChangeText={set("legal_notes")} multiline />
          <Field label="Est. ROI" value={f.inv_roi} onChangeText={set("inv_roi")} placeholder="14% p.a." />
          <Field label="Rental yield" value={f.inv_rental_yield} onChangeText={set("inv_rental_yield")} placeholder="3.2%" />
          <Field label="Appreciation" value={f.inv_appreciation} onChangeText={set("inv_appreciation")} placeholder="High" />
          <Field label="Street View URL" value={f.street_view_url} onChangeText={set("street_view_url")} autoCapitalize="none" />
          <Field label="Google Earth URL" value={f.google_earth_url} onChangeText={set("google_earth_url")} autoCapitalize="none" />
        </Sec>

        <Sec title="Documents & nearby (one per line)">
          <Field label="Documents  (label|url|size)" value={f.documents} onChangeText={set("documents")} multiline autoCapitalize="none" hint="e.g. Layout approval|https://…|4.5 MB" />
          <Field label="Nearby places  (name|distance|time)" value={f.nearby_places} onChangeText={set("nearby_places")} multiline hint="e.g. City Hospital|2.4 km|8 min" />
        </Sec>

        <Button label={editing ? "Save changes" : "Create property"} onPress={save} loading={saving} style={{ marginTop: 6 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: space.md }}>
      <Text style={{ fontSize: T.body.fontSize, fontWeight: "600", color: colors.ink, marginBottom: space.sm }}>{title}</Text>
      {children}
    </Card>
  );
}

function Choice({ label, options, value, onChange }: { label: string; options: { k: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.inkSoft, fontWeight: "600", marginBottom: 8, fontSize: 13 }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const on = value === o.k;
          return (
            <Pressable key={o.k} onPress={() => onChange(o.k)} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.brand : colors.surface, borderWidth: 1, borderColor: on ? colors.brand : colors.border }}>
              <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 12, textTransform: "capitalize" }}>{o.l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: "500", fontSize: 14 }}>{label}</Text>
      <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? colors.brand : colors.surfaceSunken, alignItems: value ? "flex-end" : "flex-start" }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" }} />
      </View>
    </Pressable>
  );
}
