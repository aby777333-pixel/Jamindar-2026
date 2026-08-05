import { useEffect, useState } from "react";
import { Text, View, ScrollView, Pressable, Alert, Image, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Button } from "@/components/ui";
import { Field } from "@/components/Field";
import { colors, space, type as T } from "@/lib/theme";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/types";
import {
  pickAndUploadMedia,
  pickAndUploadDocuments,
  captureLocation,
  createSubmission,
  updateSubmission,
  fetchSubmission,
  canEditSubmission,
  type SubmissionDoc,
} from "@/lib/submissions";
import { usePromoterGate } from "@/components/PromoterGate";

const TYPES = Object.entries(PROPERTY_TYPE_LABELS) as [PropertyType, string][];

export default function SubmitProperty() {
  const router = useRouter();
  // Bug report 20: with an `id` this same form edits an existing submission
  // instead of creating one. Reusing the form rather than writing a second one
  // means the two can never drift apart field by field.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? String(id) : null;
  const [loadingExisting, setLoadingExisting] = useState(!!editingId);

  const [f, setF] = useState({
    title: "", property_type: "" as PropertyType | "", price: "", area_value: "", area_unit: "sqft",
    address: "", locality: "", city: "", district: "", state: "", pincode: "",
    gmaps_url: "", street_view_url: "", seller_name: "", seller_phone: "", seller_notes: "", notes: "", comments: "",
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
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [gps, setGps] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editing: load the submitted row and put every field back on screen. If the
  // admin has already picked it up, the database would refuse the write, so
  // send the promoter back rather than let them type into a dead form.
  useEffect(() => {
    if (!editingId) return;
    let alive = true;
    (async () => {
      try {
        const s = await fetchSubmission(editingId);
        if (!alive) return;
        if (!s) {
          Alert.alert("Not found", "This submission is no longer available.", [{ text: "OK", onPress: () => router.back() }]);
          return;
        }
        if (!canEditSubmission(s)) {
          Alert.alert("Can't edit now", "The Jamin team has already picked this up for review.", [
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }
        setF({
          title: s.title ?? "",
          property_type: (s.property_type as PropertyType | null) ?? "",
          price: s.price != null ? String(s.price) : "",
          area_value: s.area_value != null ? String(s.area_value) : "",
          area_unit: s.area_unit ?? "sqft",
          address: s.address ?? "",
          locality: s.locality ?? "",
          city: s.city ?? "",
          district: s.district ?? "",
          state: s.state ?? "",
          pincode: s.pincode ?? "",
          gmaps_url: s.gmaps_url ?? "",
          street_view_url: s.street_view_url ?? "",
          seller_name: s.seller_name ?? "",
          seller_phone: s.seller_phone ?? "",
          seller_notes: s.seller_notes ?? "",
          notes: s.notes ?? "",
          comments: s.comments ?? "",
        });
        setImages(s.images ?? []);
        setVideos(s.videos ?? []);
        setDocuments(s.documents ?? []);
        // Keep the GPS pin that was captured — dropping it would silently wipe
        // the location off the record on the next save.
        setLoc(s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);
      } catch (e: any) {
        Alert.alert("Couldn't open", e?.message ?? "Please try again.");
      } finally {
        if (alive) setLoadingExisting(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function warnSkipped(skipped: string[]) {
    if (skipped.length)
      Alert.alert("Some files were too large", `Files over 50 MB were skipped:\n${skipped.join("\n")}\n\nTip: trim long videos or upload a shorter clip.`);
  }

  async function addMedia() {
    setUploading(true);
    try {
      const res = await pickAndUploadMedia();
      if (res.images.length) setImages((p) => [...p, ...res.images]);
      if (res.videos.length) setVideos((v) => [...v, ...res.videos]);
      warnSkipped(res.skipped);
    } catch (e: any) {
      Alert.alert("Couldn't add media", e?.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function addDocsFromDevice() {
    setUploadingDocs(true);
    try {
      const res = await pickAndUploadDocuments();
      if (res.docs.length) setDocuments((d) => [...d, ...res.docs]);
      warnSkipped(res.skipped);
    } catch (e: any) {
      Alert.alert("Couldn't add documents", e?.message ?? "Please try again.");
    } finally {
      setUploadingDocs(false);
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
      const payload = {
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
        comments: f.comments.trim() || undefined,
      };

      if (editingId) {
        // No separate resubmit call: the ps_touch trigger puts the row back to
        // 'submitted' and clears the old review note, so saving IS resubmitting.
        await updateSubmission(editingId, payload);
        Alert.alert("Changes sent", "Your corrected property has gone back to the Jamin team for review.", [
          { text: "Done", onPress: () => router.back() },
        ]);
        return;
      }

      await createSubmission(payload);
      Alert.alert("Submitted", "Your property has been submitted for review. You can track its status in Lead Capture.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(editingId ? "Couldn't save changes" : "Couldn't submit", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const gate = usePromoterGate();
  if (gate) return gate;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>
          {editingId ? "Edit submission" : "Submit a property"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, marginBottom: space.sm }}>
          {editingId
            ? "Correct anything that needs changing. Saving sends the updated version back for review and replaces the one the team has."
            : "Found an off-market property? Submit it for the admin team to review and publish."}
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
          <Pressable onPress={addMedia} disabled={uploading} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", borderRadius: 12, paddingVertical: 14, marginBottom: space.sm }}>
            {uploading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="camera" size={18} color={colors.brand} />}
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>{uploading ? "Uploading…" : "Add photos & videos"}</Text>
          </Pressable>
          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: -6, marginBottom: space.sm, textAlign: "center" }}>
            Pick multiple photos and videos from your phone (up to 50 MB each).
          </Text>
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

          {/* Bug report 16: "Or paste a video link (YouTube…)" was too long for
              the field — the tail wrapped out of the single-line input and read
              as clipped. Short enough to fit at any font scale. */}
          <LinkAdder placeholder="Paste a video link" value={videoLink} onChange={setVideoLink} onAdd={addVideo} icon="videocam" />
          {videos.map((v, i) => (
            <Row key={v + i} icon="videocam" text={v.includes("/submissions/") ? `Video ${i + 1} · uploaded from phone` : v} onRemove={() => setVideos((p) => p.filter((_, j) => j !== i))} />
          ))}

          <View style={{ height: space.sm }} />
          <Pressable onPress={addDocsFromDevice} disabled={uploadingDocs} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", borderRadius: 12, paddingVertical: 14, marginBottom: space.xs }}>
            {uploadingDocs ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="document-attach" size={18} color={colors.brand} />}
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>{uploadingDocs ? "Uploading…" : "Upload documents (PDF, patta, layout…)"}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            <View style={{ flex: 1 }}>
              <TextInput value={docLabel} onChangeText={setDocLabel} placeholder="Doc label" placeholderTextColor={colors.inkFaint}
                numberOfLines={1} textAlignVertical="center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, paddingVertical: 10, fontSize: 14, color: colors.ink }} />
            </View>
            <View style={{ flex: 1.4 }}>
              <TextInput value={docUrl} onChangeText={setDocUrl} placeholder="Document link" placeholderTextColor={colors.inkFaint} autoCapitalize="none"
                numberOfLines={1} textAlignVertical="center"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, paddingVertical: 10, fontSize: 14, color: colors.ink }} />
            </View>
            <Pressable onPress={addDoc} style={{ backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
          {documents.map((d, i) => (
            <Row key={d.url + i} icon="document-text" text={d.label} onRemove={() => setDocuments((p) => p.filter((_, j) => j !== i))} />
          ))}
          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 6 }}>Voice notes are coming soon.</Text>
        </Section>

        <Section title="Seller contact">
          <Field label="Seller name" value={f.seller_name} onChangeText={set("seller_name")} placeholder="Owner / agent name" />
          <Field label="Seller phone" value={f.seller_phone} onChangeText={set("seller_phone")} placeholder="+91 …" keyboardType="phone-pad" />
          <Field label="Seller notes" value={f.seller_notes} onChangeText={set("seller_notes")} placeholder="Best time to call, terms…" multiline />
        </Section>

        <Section title="Comments for the review team">
          <Field label="Comments (optional)" value={f.comments} onChangeText={set("comments")} placeholder="Anything the admin team should know about this property or the uploads…" multiline />
        </Section>

        <Button
          label={editingId ? "Save & resubmit" : "Submit for review"}
          loading={saving || loadingExisting}
          onPress={onSubmit}
        />
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
        {/* single line + centred: a long value must never wrap out of view */}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          numberOfLines={1}
          textAlignVertical="center"
          style={{ flex: 1, minHeight: 44, paddingVertical: 10, fontSize: 14, color: colors.ink }}
        />
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
