import { useEffect, useState } from "react";
import { Text, View, ScrollView, Pressable, Alert, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Card, Button, Loading } from "@/components/ui";
import { Field } from "@/components/Field";
import { ZoomableImageViewer } from "@/components/ImageViewer";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { fetchMyKyc, submitKyc, uploadKycDoc, signedKycUrl, type KycPayload } from "@/lib/kyc";
import { logActivity } from "@/lib/audit";
import type { KycSubmission } from "@/lib/types";

type Form = Record<keyof KycPayload, string>;

const EMPTY = {
  pan_number: "", aadhaar_number: "",
  pan_doc: "", aadhaar_front: "", aadhaar_back: "",
  addr_house: "", addr_street: "", addr_landmark: "", addr_area: "", addr_city: "",
  addr_district: "", addr_state: "", addr_country: "India", addr_pincode: "",
  bank_account_name: "", bank_account_number: "", bank_ifsc: "", bank_name: "", bank_branch: "", bank_proof: "", upi_id: "",
  nominee_name: "", nominee_relationship: "", nominee_phone: "", nominee_email: "", nominee_address: "",
  nominee_pan: "", nominee_aadhaar: "", nominee_pan_doc: "", nominee_aadhaar_front: "", nominee_aadhaar_back: "",
} as Form;

export default function BuyerKyc() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<KycSubmission | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [declared, setDeclared] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ uri: string; title: string } | null>(null);

  /** Open a submitted document full-screen via a short-lived signed URL. */
  async function openDoc(path: string, title: string) {
    if (!path) return;
    const url = await signedKycUrl(path);
    if (url) setViewer({ uri: url, title });
    else Alert.alert("Preview unavailable", "Couldn't open this document right now. Please try again.");
  }

  useEffect(() => {
    if (!profile?.id) return;
    fetchMyKyc(profile.id)
      .then((sub) => {
        setExisting(sub);
        if (sub) {
          // prefill textual fields for review / resubmit
          setForm((f) => {
            const next = { ...f };
            (Object.keys(EMPTY) as (keyof Form)[]).forEach((k) => {
              const v = (sub as any)[k];
              if (typeof v === "string") next[k] = v;
            });
            return next;
          });
        }
      })
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function pickDoc(kind: keyof Form) {
    if (!profile?.id) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Please allow photo access to attach your document.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        Alert.alert("Couldn't read image", "Please try a different photo.");
        return;
      }
      setUploading(kind);
      const path = await uploadKycDoc(profile.id, kind, asset.base64, asset.mimeType);
      setForm((f) => ({ ...f, [kind]: path }));
      setPreviews((p) => ({ ...p, [kind]: asset.uri }));
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  }

  const doc = (kind: keyof Form, label: string) => (
    <DocRow label={label} previewUri={previews[kind]} hasFile={!!form[kind]} busy={uploading === kind} onPick={() => pickDoc(kind)} />
  );

  function validate(): string | null {
    if (!form.pan_number.trim()) return "PAN number is required.";
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(form.pan_number.trim())) return "Enter a valid PAN (e.g. ABCDE1234F).";
    if (form.aadhaar_number.replace(/\s/g, "").length !== 12) return "Aadhaar must be 12 digits.";
    if (!form.addr_city.trim() || !form.addr_pincode.trim()) return "Courier city and PIN code are required.";
    if (!form.bank_account_number.trim() || !form.bank_ifsc.trim()) return "Bank account number and IFSC are required.";
    if (!form.nominee_name.trim()) return "Nominee name is required.";
    if (!declared) return "Please accept the declaration to submit.";
    return null;
  }

  async function onSubmit() {
    const err = validate();
    if (err) {
      Alert.alert("Almost there", err);
      return;
    }
    setSaving(true);
    try {
      await submitKyc(form as KycPayload);
      logActivity("kyc_submitted_client");
      await refreshProfile();
      Alert.alert(
        "KYC submitted",
        "Thank you. Our team will review your details shortly. You'll be notified once it's verified.",
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="Loading your KYC…" />;

  const approved = existing?.status === "approved";
  const pending = existing?.status === "pending";
  const rejected = existing?.status === "rejected";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>
          KYC Verification
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* status banner */}
        {approved ? (
          <Card style={{ alignItems: "center", paddingVertical: space.lg, marginBottom: space.md }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="shield-checkmark" size={32} color={colors.success} />
            </View>
            <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, marginTop: space.sm }}>KYC Verified</Text>
            <Text style={{ color: colors.inkFaint, textAlign: "center", marginTop: 4, fontSize: T.small.fontSize, lineHeight: 20 }}>
              Your identity is verified. You have full access to all Jamin services.
            </Text>
          </Card>
        ) : pending ? (
          /* Owner report 27-07: once submitted, details are LOCKED while under
             review — the user gets a read-only preview (docs open full screen)
             instead of editable fields. */
          <>
            <StatusNote tone="warning" icon="lock-closed-outline" title="Under review — locked" body="Your KYC is submitted and locked while our team verifies it. Preview everything you sent below. We'll notify you once it's done." />
            <Section title="Identity" subtitle="Submitted details">
              <ReadRow label="PAN Number" value={form.pan_number} />
              <ReadRow label="Aadhaar Number" value={form.aadhaar_number} />
              <Divider />
              <DocPreviewRow label="PAN card photo" hasFile={!!form.pan_doc} onView={() => openDoc(form.pan_doc, "PAN card photo")} />
              <DocPreviewRow label="Aadhaar — front" hasFile={!!form.aadhaar_front} onView={() => openDoc(form.aadhaar_front, "Aadhaar — front")} />
              <DocPreviewRow label="Aadhaar — back" hasFile={!!form.aadhaar_back} onView={() => openDoc(form.aadhaar_back, "Aadhaar — back")} />
            </Section>
            <Section title="Courier Address" subtitle="Submitted details">
              <ReadRow label="Address" value={[form.addr_house, form.addr_street, form.addr_landmark, form.addr_area].filter(Boolean).join(", ")} />
              <ReadRow label="City / District" value={[form.addr_city, form.addr_district].filter(Boolean).join(", ")} />
              <ReadRow label="State — PIN" value={[form.addr_state, form.addr_pincode].filter(Boolean).join(" — ")} />
            </Section>
            <Section title="Bank Details" subtitle="Submitted details">
              <ReadRow label="Account holder" value={form.bank_account_name} />
              <ReadRow label="Account number" value={form.bank_account_number ? "•••• " + form.bank_account_number.slice(-4) : ""} />
              <ReadRow label="IFSC · Bank" value={[form.bank_ifsc, form.bank_name].filter(Boolean).join(" · ")} />
              {form.upi_id ? <ReadRow label="UPI" value={form.upi_id} /> : null}
              {form.bank_proof ? (
                <>
                  <Divider />
                  <DocPreviewRow label="Cancelled cheque / passbook" hasFile onView={() => openDoc(form.bank_proof, "Bank proof")} />
                </>
              ) : null}
            </Section>
            <Section title="Nominee" subtitle="Submitted details">
              <ReadRow label="Name" value={form.nominee_name} />
              <ReadRow label="Relationship" value={form.nominee_relationship} />
              <ReadRow label="Phone" value={form.nominee_phone} />
              {form.nominee_pan_doc ? <DocPreviewRow label="Nominee PAN" hasFile onView={() => openDoc(form.nominee_pan_doc, "Nominee PAN")} /> : null}
              {form.nominee_aadhaar_front ? <DocPreviewRow label="Nominee Aadhaar — front" hasFile onView={() => openDoc(form.nominee_aadhaar_front, "Nominee Aadhaar — front")} /> : null}
              {form.nominee_aadhaar_back ? <DocPreviewRow label="Nominee Aadhaar — back" hasFile onView={() => openDoc(form.nominee_aadhaar_back, "Nominee Aadhaar — back")} /> : null}
            </Section>
            <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.inkFaint} />
              <Text style={{ flex: 1, color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: 19 }}>
                Need to correct something? Contact the Jamin desk from Support and our team will reopen your KYC.
              </Text>
            </View>
          </>
        ) : (
          <>
            {rejected ? <StatusNote tone="danger" icon="alert-circle-outline" title="Action needed" body={existing?.review_reason || "Your KYC was rejected. Please review your details and resubmit."} corrections={existing?.review_corrections} /> : null}
            {!existing ? <StatusNote tone="neutral" icon="shield-outline" title="Complete your KYC" body="Verify your identity to unlock agreements, bookings and all Jamin Property services. Your information is encrypted and used only for verification." /> : null}

            {/* Identity */}
            <Section title="Identity" subtitle="As per your official documents">
              <Field label="PAN Number" value={form.pan_number} onChangeText={set("pan_number")} placeholder="ABCDE1234F" autoCapitalize="characters" hint="Format: ABCDE1234F" />
              <Field label="Aadhaar Number" value={form.aadhaar_number} onChangeText={set("aadhaar_number")} placeholder="1234 5678 9012" keyboardType="number-pad" hint="12-digit UIDAI number" />
              <Divider />
              {doc("pan_doc", "PAN card photo")}
              {doc("aadhaar_front", "Aadhaar — front")}
              {doc("aadhaar_back", "Aadhaar — back")}
            </Section>

            {/* Courier address */}
            <Section title="Courier Address" subtitle="For agreements, documents & certificates">
              <Field label="House / Flat No." value={form.addr_house} onChangeText={set("addr_house")} placeholder="12A" />
              <Field label="Street" value={form.addr_street} onChangeText={set("addr_street")} placeholder="MG Road" />
              <Field label="Landmark" value={form.addr_landmark} onChangeText={set("addr_landmark")} placeholder="Near Metro Station" />
              <Field label="Area" value={form.addr_area} onChangeText={set("addr_area")} placeholder="Indiranagar" />
              <Field label="City" value={form.addr_city} onChangeText={set("addr_city")} placeholder="Bengaluru" />
              <Field label="District" value={form.addr_district} onChangeText={set("addr_district")} placeholder="Bengaluru Urban" />
              <Field label="State" value={form.addr_state} onChangeText={set("addr_state")} placeholder="Karnataka" />
              <Field label="PIN Code" value={form.addr_pincode} onChangeText={set("addr_pincode")} placeholder="560038" keyboardType="number-pad" />
            </Section>

            {/* Bank */}
            <Section title="Bank Details" subtitle="For refunds & payouts">
              <Field label="Account Holder Name" value={form.bank_account_name} onChangeText={set("bank_account_name")} placeholder="As per bank records" />
              <Field label="Account Number" value={form.bank_account_number} onChangeText={set("bank_account_number")} placeholder="000123456789" keyboardType="number-pad" />
              <Field label="IFSC Code" value={form.bank_ifsc} onChangeText={set("bank_ifsc")} placeholder="SBIN0000123" autoCapitalize="characters" />
              <Field label="Bank Name" value={form.bank_name} onChangeText={set("bank_name")} placeholder="State Bank of India" />
              <Field label="Branch" value={form.bank_branch} onChangeText={set("bank_branch")} placeholder="Indiranagar" />
              <Field label="UPI ID (optional)" value={form.upi_id} onChangeText={set("upi_id")} placeholder="name@bank" autoCapitalize="none" />
              <Divider />
              {doc("bank_proof", "Cancelled cheque / passbook")}
            </Section>

            {/* Nominee */}
            <Section title="Nominee" subtitle="Your appointed nominee">
              <Field label="Nominee Name" value={form.nominee_name} onChangeText={set("nominee_name")} placeholder="Full legal name" />
              <Field label="Relationship" value={form.nominee_relationship} onChangeText={set("nominee_relationship")} placeholder="Spouse / Parent / Child" />
              <Field label="Phone" value={form.nominee_phone} onChangeText={set("nominee_phone")} placeholder="+91 00000 00000" keyboardType="phone-pad" />
              <Field label="Email" value={form.nominee_email} onChangeText={set("nominee_email")} placeholder="nominee@example.com" keyboardType="email-address" autoCapitalize="none" />
              <Field label="Address" value={form.nominee_address} onChangeText={set("nominee_address")} placeholder="Complete residential address" multiline />
              <Field label="Nominee PAN (optional)" value={form.nominee_pan} onChangeText={set("nominee_pan")} placeholder="ABCDE1234F" autoCapitalize="characters" />
              <Field label="Nominee Aadhaar (optional)" value={form.nominee_aadhaar} onChangeText={set("nominee_aadhaar")} placeholder="1234 5678 9012" keyboardType="number-pad" />
              <Divider />
              {doc("nominee_pan_doc", "Nominee PAN (optional)")}
              {doc("nominee_aadhaar_front", "Nominee Aadhaar — front (optional)")}
              {doc("nominee_aadhaar_back", "Nominee Aadhaar — back (optional)")}
            </Section>

            {/* privacy note */}
            <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: space.md }}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.inkFaint} />
              <Text style={{ flex: 1, color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: 19 }}>
                Your documents are stored privately and shared only with the Jamin verification team.
              </Text>
            </View>

            {/* declaration */}
            <Pressable onPress={() => setDeclared((d) => !d)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: space.md }}>
              <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: declared ? colors.brand : colors.border, backgroundColor: declared ? colors.brand : colors.surface, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                {declared ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
              </View>
              <Text style={{ flex: 1, color: colors.inkSoft, fontSize: T.small.fontSize, lineHeight: 19 }}>
                I confirm the information provided is true and correct, and I authorise Jamin Properties to verify it for KYC purposes.
              </Text>
            </Pressable>

            <Button
              label={rejected ? "Update & resubmit" : "Preview then submit"}
              onPress={onSubmit}
              loading={saving}
            />
          </>
        )}
      </ScrollView>
      <ZoomableImageViewer
        visible={!!viewer}
        uri={viewer?.uri ?? null}
        title={viewer?.title}
        onClose={() => setViewer(null)}
      />
    </SafeAreaView>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: 7 }}>
      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: "600", fontSize: T.small.fontSize + 1, marginTop: 2 }}>
        {value || "—"}
      </Text>
    </View>
  );
}

function DocPreviewRow({ label, hasFile, onView }: { label: string; hasFile: boolean; onView: () => void }) {
  return (
    <Pressable onPress={hasFile ? onView : undefined} disabled={!hasFile} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, opacity: hasFile ? 1 : 0.5 }}>
      <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={hasFile ? "document-attach" : "document-outline"} size={20} color={hasFile ? colors.success : colors.inkFaint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600", color: colors.ink, fontSize: T.small.fontSize + 1 }}>{label}</Text>
        <Text style={{ color: hasFile ? colors.brand : colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 2 }}>
          {hasFile ? "Tap to preview" : "Not attached"}
        </Text>
      </View>
      {hasFile ? <Ionicons name="eye-outline" size={19} color={colors.brand} /> : null}
    </Pressable>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.surfaceSunken, marginVertical: 8 }} />;
}

function DocRow({ label, previewUri, hasFile, busy, onPick }: { label: string; previewUri?: string; hasFile: boolean; busy: boolean; onPick: () => void }) {
  return (
    <Pressable onPress={onPick} disabled={busy} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }}>
      <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={{ width: "100%", height: "100%" }} />
        ) : (
          <Ionicons name={hasFile ? "document-attach" : "cloud-upload-outline"} size={20} color={hasFile ? colors.success : colors.inkFaint} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600", color: colors.ink, fontSize: T.small.fontSize + 1 }}>{label}</Text>
        <Text style={{ color: hasFile ? colors.success : colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 2 }}>
          {busy ? "Uploading…" : hasFile ? "Attached · tap to replace" : "Tap to upload photo"}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <Ionicons name={hasFile ? "checkmark-circle" : "chevron-forward"} size={hasFile ? 20 : 18} color={hasFile ? colors.success : colors.inkFaint} />
      )}
    </Pressable>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: space.md }}>
      <Text style={{ fontSize: T.body.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.3 }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginBottom: space.sm, marginTop: 2 }}>{subtitle}</Text> : <View style={{ height: space.sm }} />}
      {children}
    </Card>
  );
}

function StatusNote({ tone, icon, title, body, corrections }: { tone: "neutral" | "warning" | "danger"; icon: string; title: string; body: string; corrections?: string | null }) {
  const map = {
    neutral: { bg: colors.surface, fg: colors.inkSoft, ic: colors.brand },
    warning: { bg: colors.goldSoft, fg: colors.goldDark, ic: colors.goldDark },
    danger: { bg: colors.brandSoft, fg: colors.brand, ic: colors.brand },
  }[tone];
  return (
    <View style={{ backgroundColor: map.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icon as any} size={20} color={map.ic} />
        <Text style={{ fontWeight: "600", color: colors.ink, fontSize: T.body.fontSize }}>{title}</Text>
      </View>
      <Text style={{ color: colors.inkSoft, marginTop: 6, fontSize: T.small.fontSize, lineHeight: 20 }}>{body}</Text>
      {corrections ? (
        <Text style={{ color: colors.inkFaint, marginTop: 6, fontSize: T.small.fontSize, lineHeight: 20 }}>
          Required corrections: {corrections}
        </Text>
      ) : null}
    </View>
  );
}
