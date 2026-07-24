import { useState } from "react";
import { Text, View, ScrollView, Pressable, Alert, Image, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Button } from "@/components/ui";
import { Field } from "@/components/Field";
import { colors, space, type as T } from "@/lib/theme";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/types";
import { pickAndUploadPhotos, captureLocation, createSubmission, type SubmissionDoc } from "@/lib/submissions";

const TYPES = Object.entries(PROPERTY_TYPE_LABELS) as [PropertyType, string][];

export default function SubmitProperty() {
  const router = useRouter();
  const [f, setF] = useState({
    title: "", property_type: "" as PropertyType | "", price: "", area_value: "", area_unit: "sqft",
    address: "", locality: "", city: "", district: "", state: "", pincode: "",
    gmaps_url: "", street_view_url: "", seller_name: "", seller_phone: "", seller_notes: "", notes: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<SubmissionDoc[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [videoLink, setVideoLink] = useState("");
  const [docLabel, setDocLabel] = useState("");
  const [docUrl, setDocUrl] = useState("");

  const [uploading, setUploading] = useState(false);
  const [gps, setGps] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addPhotos() {
    setUploading(true);
    try {
      const urls = await pickAndUploadPhotos();
      if (urls.length) setImages((p) => [...p, ...urls]);
    } catch (e: any) {
      Alert.alert("Couldn't add photos", e?.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function getGps() {
    setGps(true);
    try {
      setLoc(await captureLocation());
    } catch (e: any) {
      Alert.alert("Location unavailable", e?.message ?? "Please try again.");
    } finally {
      setGps(false);
    }
  }

  function addVideo() {
    const u = videoLink.trim();
    if (!u) return;
    setVideos((v) => [...v, u]);
    setVideoLink("");
  }
  function addDoc() {
    const u = docUrl.trim();
    if (!u) return;
    setDocuments((d) => [...d, { label: docLabel.trim() || "Document", url: u }]);
    setDocLabel("");
    setDocUrl("");
  }

  async function onSubmit() {
    if (f.title.trim().length < 3) return Alert.alert("Title needed", "Give the property a short title.");
    if (!f.city.trim() && !f.address.trim()) return Alert.alert("Location needed", "Enter at least a city or address.");
    setSaving(true);
    try {
      await createSubmission({
        title: f.title.trim(),
        property_type: f.property_type || undefined,
        price: f.price ? Number(f.price.replace(/[^0-9.]/g, "")) : null,
        area_value: f.area_value ? Number(f.area_value.replace(/[^0-9.]/g, "")) : null,
        area_unit: f.area_unit || undefined,
        address: f.address.trim() || undefined,
        locality: f.locality.trim() || undefined,
        city: f.city.trim() || undefined,
        district: f.district.trim() || undefined,
        state: f.state.trim() || undefined,
        pincode: f.pincode.trim() || undefined,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        gmaps_url: f.gmaps_url.trim() || undefined,
        street_view_url: f.street_view_url.trim() || undefined,
        images, videos, documents,
        seller_name: f.seller_name.trim() || undefined,
        seller_phone: f.seller_phone.trim() || undefined,
        seller_notes: f.seller_notes.trim() || undefined,
        notes: f.notes.trim() || undefined,
      });
      Alert.alert("Submitted", "Your property has been submitted for review. You can track its status in Lead Capture.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Submit a property</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, marginBottom: space.sm }}>
          Found an off-market property? Submit it for the admin team to review and publish.
        </Text>

        <Section title="Property details">
          <Field label="Title" value={f.title} onChangeText={set("title")} placeholder="e.g. 3-acre farm land near Hosur" />
          <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13, marginBottom: 6, marginTop: 4 }}>Type</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: space.sm }}>
            {TYPES.map(([key, label]) => {
              const on = f.property_type === key;
              return (
                <Pressable key={key} onPress={() => setF((s) => ({ ...s, property_type: on ? "" : key }))}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.brand : colors.surface, borderWidth: 1, borderColor: on ? colors.brand : colors.border }}>
                  <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 12 }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}><Field label="Price (₹)" value={f.price} onChangeText={set("price")} placeholder="5000000" keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Area" value={f.area_value} onChangeText={set("area_value")} placeholder="1200" keyboardType="number-pad" /></View>
          </View>
          <Field label="Description" value={f.notes} onChangeText={set("notes")} placeholder="Key highlights, dimensions, approvals…" multiline />
        </Section>

        <Section title="Location">
          <Field label="Address" value={f.address} onChangeText={set("address")} placeholder="Survey no. / street" />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}><Field label="Locality" value={f.locality} onChangeText={set("locality")} placeholder="Area" /></View>
            <View style={{ flex: 1 }}><Field label="City" value={f.city} onChangeText={set("city")} placeholder="City" /></View>
          </View>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}><Field label="District" value={f.district} onChangeText={set("district")} placeholder="District" /></View>
            <View style={{ flex: 1 }}><Field label="State" value={f.state} onChangeText={set("state")} placeholder="State" /></View>
          </View>
          <Field label="PIN code" value={f.pincode} onChangeText={set("pincode")} placeholder="600001" keyboardType="number-pad" />

          <Pressable onPress={getGps} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: loc ? colors.successSoft : colors.brandSoft, borderRadius: 12, padding: 12, marginTop: 4 }}>
            {gps ? <ActivityIndicator color={colors.brand} /> : <Ionicons name={loc ? "checkmark-circle" : "location"} size={18} color={loc ? colors.success : colors.brand} />}
            <Text style={{ color: loc ? colors.success : colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>
              {loc ? `Location captured (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})` : "Use my current GPS location"}
            </Text>
          </Pressable>
          <View style={{ height: space.sm }} />
          <Field label="Google Maps link (optional)" value={f.gmaps_url} onChangeText={set("gmaps_url")} placeholder="https://maps.google.com/…" autoCapitalize="none" />
          <Field label="Street View link (optional)" value={f.street_view_url} onChangeText={set("street_view_url")} placeholder="https://…" autoCapitalize="none" />
        </Section>

        <Section title="Photos & media">
          <Pressable onPress={addPhotos} disabled={uploading} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", borderRadius: 12, paddingVertical: 14, marginBottom: space.sm }}>
            {uploading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="camera" size={18} color={colors.brand} />}
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>{uploading ? "Uploading…" : "Add photos"}</Text>
          </Pressable>
          {images.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: space.sm }}>
              {images.map((uri, i) => (
                <View key={uri} style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden" }}>
                  <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
                  <Pressable onPress={() => setImages((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: 2, right: 2, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={13} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <LinkAdder placeholder="Paste a video link" value={videoLink} onChange={setVideoLink} onAdd={addVideo} icon="videocam" />
          {videos.map((v, i) => (
            <Row key={v} icon="videocam" text={v} onRemove={() => setVideos((p) => p.filter((_, j) => j !== i))} />
          ))}

          <View style={{ height: space.xs }} />
          <View style={{ flexDirection: "row", gap: space.xs }}>
            <View style={{ flex: 1 }}>
              <TextInput value={docLabel} onChangeText={setDocLabel} placeholder="Doc label" placeholderTextColor={colors.inkFaint}
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: colors.ink }} />
            </View>
            <View style={{ flex: 1.4 }}>
              <TextInput value={docUrl} onChangeText={setDocUrl} placeholder="Document link" placeholderTextColor={colors.inkFaint} autoCapitalize="none"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: colors.ink }} />
            </View>
            <Pressable onPress={addDoc} style={{ backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
          {documents.map((d, i) => (
            <Row key={d.url + i} icon="document-text" text={d.label} onRemove={() => setDocuments((p) => p.filter((_, j) => j !== i))} />
          ))}
          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 6 }}>Voice notes &amp; direct video upload are coming soon.</Text>
        </Section>

        <Section title="Seller contact">
          <Field label="Seller name" value={f.seller_name} onChangeText={set("seller_name")} placeholder="Owner / agent name" />
          <Field label="Seller phone" value={f.seller_phone} onChangeText={set("seller_phone")} placeholder="+91 …" keyboardType="phone-pad" />
          <Field label="Seller notes" value={f.seller_notes} onChangeText={set("seller_notes")} placeholder="Best time to call, terms…" multiline />
        </Section>

        <Button label="Submit for review" loading={saving} onPress={onSubmit} />
        <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.sm, lineHeight: T.small.lineHeight }}>
          The admin team will review your submission before it goes live.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: space.md }}>
      <Text style={{ fontSize: T.body.fontSize, fontWeight: "800", color: colors.ink, marginBottom: space.sm }}>{title}</Text>
      {children}
    </Card>
  );
}

function LinkAdder({ placeholder, value, onChange, onAdd, icon }: { placeholder: string; value: string; onChange: (v: string) => void; onAdd: () => void; icon: string }) {
  return (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12 }}>
        <Ionicons name={icon as any} size={16} color={colors.inkFaint} />
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.inkFaint} autoCapitalize="none" style={{ flex: 1, paddingVertical: 11, fontSize: 14, color: colors.ink }} />
      </View>
      <Pressable onPress={onAdd} style={{ backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="add" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

function Row({ icon, text, onRemove }: { icon: string; text: string; onRemove: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 }}>
      <Ionicons name={icon as any} size={16} color={colors.inkSoft} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.inkSoft, fontSize: T.small.fontSize }}>{text}</Text>
      <Pressable onPress={onRemove} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.inkFaint} /></Pressable>
    </View>
  );
}
