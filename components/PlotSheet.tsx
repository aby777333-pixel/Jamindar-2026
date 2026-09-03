import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { openExternal } from "../lib/browser";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Image, Linking, Modal, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import * as ImagePicker from "expo-image-picker";

import { colors } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/store";
import { formatINR } from "../lib/format";
import type { Property } from "../lib/types";
import type { PlotRow } from "./PlotPlan";
import {
  ADVANCE_STATUS_LABEL, fetchMyAdvance, submitAdvancePayment, uploadPaymentProof,
  type AdvancePayment, type BankAccount, type UploadedProof,
} from "../lib/advance";

/**
 * Full detail sheet for one plot.
 *
 * Plot-level facts come off the sanctioned schedule; everything else
 * (brochure, gallery, videos, maps, landmarks, documents, promoter) is the
 * property's own data, so a plot inherits whatever the listing already has
 * rather than needing it entered twice.
 *
 * Any section with nothing behind it is omitted entirely — an empty gallery or
 * a dead "Brochure" button reads as broken, and this sheet is often the last
 * thing a buyer sees before calling.
 */

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  reserved: "On hold",
  booked: "Booked",
  sold: "Sold",
  blocked: "Not released",
};
const STATUS_TINT: Record<string, string> = {
  available: colors.success,
  reserved: colors.gold,
  booked: "#D93025",
  sold: "#4A4A4A",
  blocked: colors.inkFaint,
};

const SQFT_PER_SQM = 10.7639;

/** A row of plot_holds with status 'held' — the one hold that currently blocks a plot. */
interface LiveHold {
  id: string;
  buyer_id: string;
  ref: string;
  expires_at: string | null;
  amount: number | null;
  method: string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Maps / satellite / Street View / Earth from the property pin, using Google's
 * documented Maps URLs scheme — no API key. An explicit URL on the property
 * wins, which matters when the site entrance is not what a lookup lands on.
 */
function mapLinks(p: Property) {
  const lat = p.lat === null || p.lat === undefined ? null : Number(p.lat);
  const lng = p.lng === null || p.lng === undefined ? null : Number(p.lng);
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  const at = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    maps: p.gmaps_url || `https://www.google.com/maps/search/?api=1&query=${at}`,
    satellite: `https://www.google.com/maps/@?api=1&map_action=map&center=${at}&zoom=18&basemap=satellite`,
    streetView: p.street_view_url || `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${at}`,
    earth: p.google_earth_url || `https://earth.google.com/web/@${at},0a,800d,35y,0h,45t,0r`,
    coords: `${lat.toFixed(6)}° ${lat >= 0 ? "N" : "S"}, ${lng.toFixed(6)}° ${lng >= 0 ? "E" : "W"}`,
  };
}

/** Indicative EMI — 20% down, 8.5% p.a., 20 years. Not an offer of finance. */
function indicativeEmi(total: number) {
  const principal = total * 0.8;
  const r = 8.5 / 12 / 100;
  const n = 240;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 12.5, color: colors.inkFaint }}>{label}</Text>
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.ink, flexShrink: 1, textAlign: "right" }}>{value || "—"}</Text>
    </View>
  );
}

/**
 * The company's bank accounts for this project (0096). Shown on the payment
 * step so a buyer can transfer without waiting for a call. Each value is
 * copyable — an account number retyped from a phone screen is how transfers
 * go astray.
 */
function BankAccounts({ accounts }: { accounts: BankAccount[] }) {
  if (!accounts.length) return null;
  const copy = async (label: string, v?: string) => {
    if (!v) return;
    await Clipboard.setStringAsync(v);
    Alert.alert("Copied", `${label} copied to clipboard.`);
  };
  return (
    <View style={{ gap: 8 }}>
      {accounts.map((a, i) => (
        <View key={i} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.ink, paddingVertical: 6 }}>
            {a.bank_name || `Bank account ${i + 1}`}{a.account_type ? ` · ${a.account_type}` : ""}
          </Text>
          {a.account_name ? <Row label="Account name" value={a.account_name} /> : null}
          {a.account_no ? (
            <Pressable onPress={() => copy("Account number", a.account_no)}>
              <Row label="Account number  (tap to copy)" value={a.account_no} />
            </Pressable>
          ) : null}
          {a.ifsc ? (
            <Pressable onPress={() => copy("IFSC", a.ifsc)}>
              <Row label="IFSC  (tap to copy)" value={a.ifsc} />
            </Pressable>
          ) : null}
          {a.branch ? <Row label="Branch" value={a.branch} /> : null}
        </View>
      ))}
    </View>
  );
}

const ADVANCE_TINT: Record<string, string> = {
  pending: colors.gold,
  approved: colors.success,
  rejected: "#D93025",
};

/** The buyer's recorded advance and where it stands (0096). */
function AdvanceCard({ row }: { row: AdvancePayment }) {
  const tint = ADVANCE_TINT[row.status] ?? colors.inkFaint;
  return (
    <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceAlt }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.ink }}>Advance payment {row.ref}</Text>
        <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${tint}1A` }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: tint }}>{ADVANCE_STATUS_LABEL[row.status] ?? row.status}</Text>
        </View>
      </View>
      <Row label="Amount" value={formatINR(Number(row.amount))} />
      <Row label="Transaction ID" value={row.transaction_id} />
      <Row label="Proof" value={row.proof_path ? (row.proof_name || "Attached") : "Not attached"} />
      <Row label="Recorded" value={new Date(row.created_at).toLocaleString("en-IN")} />
      {row.status === "pending" ? (
        <Text style={{ fontSize: 11.5, color: colors.inkFaint, lineHeight: 17, marginTop: 8 }}>
          Our desk checks the transfer against the bank statement. You will be notified the moment it is approved.
        </Text>
      ) : row.status === "rejected" ? (
        <Text style={{ fontSize: 11.5, color: "#D93025", lineHeight: 17, marginTop: 8 }}>
          {row.remarks ? `Reason: ${row.remarks}. ` : ""}Please contact the sales desk, or record the payment again with the correct details.
        </Text>
      ) : (
        <Text style={{ fontSize: 11.5, color: colors.success, lineHeight: 17, marginTop: 8 }}>
          Verified{row.decided_at ? ` on ${new Date(row.decided_at).toLocaleDateString("en-IN")}` : ""}. Our team will be in touch about registration.
        </Text>
      )}
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.inkFaint, marginTop: 22, marginBottom: 2 }}>
      {title}
    </Text>
  );
}

/** Accent pairs, matching the {bg, fg} tiles used on the home screen. Colour
 *  carries meaning here — each action keeps the same hue everywhere it appears,
 *  so the eye learns "gold = a document", "blue = a map". */
const ACCENT = {
  map:      { bg: "#E7EFFD", fg: "#2B62C4" },
  satellite:{ bg: "#E4F3EC", fg: "#1B7A4E" },
  street:   { bg: "#F0EAFB", fg: "#6A45C0" },
  earth:    { bg: "#E6F1F6", fg: "#1F6C86" },
  brochure: { bg: "#FCE9E8", fg: "#C4342A" },
  video:    { bg: "#F3E9FA", fg: "#7B3FA8" },
  doc:      { bg: "#FBF0DC", fg: "#A9741A" },
  share:    { bg: "#E4F3EC", fg: "#1B7A4E" },
  qr:       { bg: "#E9EBF3", fg: "#37415F" },
  copy:     { bg: "#EDEEF1", fg: "#4B5563" },
} as const;

function Action({
  icon, label, onPress, grid, accent,
}: {
  icon: any; label: string; onPress: () => void; grid?: boolean;
  accent?: { bg: string; fg: string };
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 8,
        borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
        borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8,
        // `grid` lays the item out as one half of an even two-column row, so a
        // set of four reads as a tidy 2x2 instead of wrapping 3 + 1, and every
        // row lines up down the sheet instead of ending ragged.
        ...(grid ? { flexGrow: 1, flexBasis: "46%" } : null),
      }}
    >
      <View
        style={{
          width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center",
          backgroundColor: accent?.bg ?? colors.surfaceAlt,
        }}
      >
        <Ionicons name={icon} size={14} color={accent?.fg ?? colors.ink} />
      </View>
      {/* One line, ellipsised: a long document title must not break the grid. */}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: colors.ink, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PlotSheet({
  visible,
  plot,
  property,
  shareUrl,
  onClose,
}: {
  visible: boolean;
  plot: PlotRow | null;
  property: Property;
  shareUrl?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [showQR, setShowQR] = useState(false);
  // Hold flow. Jamin Bazaar takes money by bank transfer and UPI — there is no
  // gateway — so this reserves the plot and hands off to the sales desk rather
  // than pretending to take a payment.
  const [step, setStep] = useState<"detail" | "confirm" | "done" | "pay" | "paid">("detail");
  const [method, setMethod] = useState<"bank" | "upi">("bank");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<{ ref: string; holdId?: string; expiresAt: string; amount: number | null } | null>(null);
  // Advance payment (0096): the buyer pays the project's minimum advance from
  // their own bank app and records it here with the transaction id + proof.
  const [payAmount, setPayAmount] = useState("");
  const [txn, setTxn] = useState("");
  const [proof, setProof] = useState<(UploadedProof & { uri: string }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paid, setPaid] = useState<{ ref: string } | null>(null);
  const { profile } = useAuth();
  const qc = useQueryClient();

  const bankAccounts: BankAccount[] = Array.isArray(property.bank_accounts) ? property.bank_accounts : [];
  const minAdvance = num(property.min_advance_amount);
  // The option exists once the desk has set a minimum OR entered an account.
  const advanceOffered = minAdvance != null || bankAccounts.length > 0;

  const { data: myAdvance } = useQuery({
    queryKey: ["advance", property.id, plot?.plot == null ? null : String(plot.plot), profile?.id ?? null],
    enabled: visible && !!plot && !!profile?.id && advanceOffered,
    queryFn: () => fetchMyAdvance(profile!.id, property.id, plot?.plot == null ? null : String(plot.plot)),
  });

  /**
   * The live hold on this plot, if there is one (bug report 22: a buyer who put
   * a plot on hold had no way to take it back — only an admin could).
   *
   * RLS on plot_holds returns own rows only, so a buyer can never see, let alone
   * withdraw, someone else's hold; super admins see all, which is what lets them
   * release on a caller's behalf. release_plot_hold enforces the same rule again
   * server-side, so this query is a display concern, not the security boundary.
   */
  const { data: liveHold } = useQuery({
    queryKey: ["plot-hold", property.id, plot?.plot ?? null],
    enabled: visible && !!plot && !!profile?.id,
    queryFn: async (): Promise<LiveHold | null> => {
      const { data } = await supabase
        .from("plot_holds")
        .select("id, buyer_id, ref, expires_at, amount, method")
        .eq("property_id", property.id)
        .eq("plot", plot!.plot)
        .eq("status", "held")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as LiveHold) ?? null;
    },
  });

  const links = useMemo(() => mapLinks(property), [property]);
  if (!plot) return null;

  function close() {
    setStep("detail");
    setHeld(null);
    setPaid(null);
    onClose();
  }

  function openPay() {
    const suggested = minAdvance ?? num(plot?.booking_amount);
    setPayAmount(suggested ? String(Math.round(suggested)) : "");
    setTxn("");
    setProof(null);
    setStep("pay");
  }

  /** Photo or screenshot of the transfer → private payment-proofs bucket. */
  async function attachProof() {
    if (!profile?.id) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Photo access needed", "Please allow photo access to attach the payment screenshot.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        Alert.alert("Couldn't read image", "Please try a different screenshot.");
        return;
      }
      setUploading(true);
      const up = await uploadPaymentProof(profile.id, asset.base64, asset.mimeType);
      setProof({ ...up, uri: asset.uri });
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submitAdvance() {
    if (!plot) return;
    if (!profile?.id) {
      Alert.alert("Sign in first", "Please sign in so the payment is recorded in your name.");
      return;
    }
    const amount = Number(String(payAmount).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Amount", "Enter the amount you transferred.");
      return;
    }
    if (minAdvance != null && amount < minAdvance) {
      Alert.alert("Minimum advance", `The minimum advance for this project is ${formatINR(minAdvance)}.`);
      return;
    }
    if (txn.trim().length < 4) {
      Alert.alert("Transaction ID", "Enter the transaction ID / UTR shown by your bank or UPI app.");
      return;
    }
    if (!proof) {
      Alert.alert("Payment proof", "Please attach a screenshot or photo of the payment.");
      return;
    }
    setBusy(true);
    try {
      const r = await submitAdvancePayment({
        propertyId: property.id,
        amount,
        transactionId: txn.trim(),
        plot: String(plot.plot),
        holdId: held?.holdId ?? (liveHold?.buyer_id === profile.id ? liveHold.id : null),
        method,
        proof,
      });
      setPaid({ ref: r.ref });
      setStep("paid");
      qc.invalidateQueries({ queryKey: ["advance", property.id, String(plot.plot), profile.id] });
      qc.invalidateQueries({ queryKey: ["my-advances", profile.id] });
    } catch (e: any) {
      Alert.alert("Could not record the payment", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function placeHold() {
    if (!plot) return;
    if (!profile?.id) {
      Alert.alert("Sign in first", "Please sign in so we can hold this plot in your name.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("hold_plot", {
        p_property: property.id, p_plot: plot.plot, p_method: method, p_note: null,
      });
      if (error) throw error;
      const r = data as { ref: string; holdId?: string; expiresAt: string; amount: number | null };
      setHeld(r);
      setStep("done");
      // repaint the plan for everyone looking at this property
      qc.invalidateQueries({ queryKey: ["property", property.id] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["plot-hold", property.id, plot.plot] });
    } catch (e: any) {
      Alert.alert("Could not hold this plot", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Give the plot back (bug report 22). release_plot_hold flips the hold to
   * 'released' and the plot to 'available' in one transaction, and refuses
   * outright if the hold is not the caller's (or the caller is not an admin).
   */
  async function withdrawHold(holdId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("release_plot_hold", { p_hold: holdId });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["property", property.id] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["plot-hold", property.id, plot!.plot] });
      Alert.alert("Hold withdrawn", `Plot ${plot!.plot} is back on sale.`);
      // Closing lets the repainted plan show the plot green again — the `plot`
      // prop here is the snapshot the parent passed in and will not update
      // underneath us.
      close();
    } catch (e: any) {
      Alert.alert("Could not withdraw the hold", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = (plot.status ?? "available").toLowerCase();
  const price = num(plot.offer_price) ?? num(plot.price);
  const wasPrice = num(plot.offer_price) ? num(plot.price) : null;
  const reg = num(plot.registration_charges) ?? 0;
  const dev = num(plot.development_charges) ?? 0;
  const total = price ? price + reg + dev : 0;
  const sqm = plot.size_sqm ?? (plot.size_sqft ? plot.size_sqft / SQFT_PER_SQM : null);
  const approvalNo = property.plot_plan?.approvalNo;
  const link = shareUrl || property.brochure_url || "";
  const gallery = (property.images ?? []).slice(0, 9);
  const videos = [...(property.videos ?? []), ...(property.drone_videos ?? [])];
  const landmarks = [
    ...(property.nearby_places ?? []).map((n) => ({ label: n.name, distance: n.distance })),
    ...(property.nearby_landmarks ?? []),
  ].slice(0, 10);

  function share() {
    const bits = [`Plot ${plot!.plot}${plot!.block ? ` · Block ${plot!.block}` : ""} — ${property.title}`];
    if (plot!.size_sqft) bits.push(`${plot!.size_sqft.toLocaleString("en-IN")} sq.ft`);
    if (price) bits.push(formatINR(price));
    if (link) bits.push(link);
    Share.share({ message: bits.join("\n") }).catch(() => {});
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={{ maxHeight: "88%", backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 + insets.bottom }}>
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 }} />

          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              {plot.block ? <Text style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.inkFaint }}>Block {plot.block}</Text> : null}
              <Text style={{ fontSize: 26, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 }}>Plot {plot.plot}</Text>
            </View>
            <View style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: `${STATUS_TINT[status] ?? colors.inkFaint}1A` }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_TINT[status] ?? colors.inkFaint }}>{STATUS_LABEL[status] ?? status}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.inkFaint} />
            </Pressable>
          </View>

          {step === "confirm" ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 21, fontWeight: "800", color: colors.ink, marginTop: 8 }}>Reserve this plot?</Text>
              <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, backgroundColor: colors.surfaceAlt, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ fontSize: 12.5, color: colors.inkFaint }}>Booking amount</Text>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>
                  {num(plot.booking_amount) ? formatINR(num(plot.booking_amount)!) : "As advised"}
                </Text>
              </View>

              <Section title="How you'll pay" />
              {([["bank", "Bank transfer", "NEFT / RTGS / IMPS to the company account"],
                 ["upi", "UPI", "Pay from any UPI app"]] as const).map(([k, label, hint]) => (
                <Pressable
                  key={k}
                  onPress={() => setMethod(k)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 8, borderColor: method === k ? colors.gold : colors.border, backgroundColor: method === k ? colors.goldSoft : colors.surface }}
                >
                  <Ionicons name={method === k ? "radio-button-on" : "radio-button-off"} size={19} color={method === k ? colors.goldDark : colors.inkFaint} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{label}</Text>
                    <Text style={{ fontSize: 11.5, color: colors.inkFaint }}>{hint}</Text>
                  </View>
                </Pressable>
              ))}

              <Text style={{ fontSize: 11.5, color: colors.inkFaint, lineHeight: 18, marginTop: 4 }}>
                We hold plot {plot.plot} for you for 48 hours. No money is taken here —{" "}
                {advanceOffered
                  ? `after the hold you can pay the advance${minAdvance != null ? ` (minimum ${formatINR(minAdvance)})` : ""} to the company account and record the transaction ID.`
                  : "our team contacts you with the account details."}{" "}
                The plot is confirmed once your transfer lands. If it does not, the hold lapses and
                the plot returns to sale.
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 18, marginBottom: 8 }}>
                <Pressable onPress={() => setStep("detail")} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>Back</Text>
                </Pressable>
                <Pressable onPress={placeHold} disabled={busy} style={{ flex: 2, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#1B1405" }}>{busy ? "Holding…" : "Hold this plot"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : step === "done" && held ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: "center", paddingVertical: 18 }}>
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="checkmark" size={31} color={colors.goldDark} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink, marginTop: 12 }}>Plot {plot.plot} is held for you</Text>
                <Text style={{ fontSize: 13, color: colors.inkFaint, marginTop: 4 }}>Reference {held.ref}</Text>
              </View>
              <Row label="Plot" value={`${plot.plot}${plot.block ? ` · Block ${plot.block}` : ""}`} />
              <Row label="Booking amount" value={held.amount ? formatINR(held.amount) : "As advised"} />
              <Row label="Method" value={method === "upi" ? "UPI" : "Bank transfer"} />
              <Row label="Held until" value={new Date(held.expiresAt).toLocaleString("en-IN")} />
              {advanceOffered ? (
                <>
                  <Section title="Pay the advance" />
                  <Text style={{ fontSize: 12.5, color: colors.inkFaint, lineHeight: 19 }}>
                    Transfer{minAdvance != null ? ` at least ${formatINR(minAdvance)}` : " the advance"} to the
                    company account below, quoting reference {held.ref}, then record the transaction ID and a
                    screenshot so our desk can verify it.
                  </Text>
                  {bankAccounts.length ? (
                    <View style={{ marginTop: 10 }}>
                      <BankAccounts accounts={bankAccounts} />
                    </View>
                  ) : null}
                  <Pressable onPress={openPay} style={{ marginTop: 14, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
                    <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>I have paid — record the advance</Text>
                  </Pressable>
                  <Pressable onPress={close} style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 13, alignItems: "center" }}>
                    <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>Pay later</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 12.5, color: colors.inkFaint, lineHeight: 19, marginTop: 14 }}>
                    Our team has been notified and will contact you with the account details. Quote
                    reference {held.ref} with your transfer. The plot shows as On hold to everyone else
                    until then.
                  </Text>
                  <Pressable onPress={close} style={{ marginTop: 20, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
                    <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>Done</Text>
                  </Pressable>
                </>
              )}
              {/* Changed your mind on the spot (bug report 22) — no need to wait
                  48 hours or ring the desk. */}
              {held.holdId ? (
                <Pressable onPress={() => withdrawHold(held.holdId!)} disabled={busy} style={{ marginTop: 10, marginBottom: 8, paddingVertical: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                  <Text style={{ color: colors.inkFaint, fontSize: 13, fontWeight: "700" }}>
                    {busy ? "Withdrawing…" : "Withdraw this hold"}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : step === "pay" ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 21, fontWeight: "800", color: colors.ink, marginTop: 8 }}>Record your advance</Text>
              <Text style={{ fontSize: 12.5, color: colors.inkFaint, lineHeight: 19, marginTop: 4 }}>
                Plot {plot.plot} · {property.title}
                {minAdvance != null ? ` · minimum advance ${formatINR(minAdvance)}` : ""}
              </Text>

              {bankAccounts.length ? (
                <>
                  <Section title="Pay into" />
                  <BankAccounts accounts={bankAccounts} />
                </>
              ) : null}

              <Section title="Paid by" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([["bank", "Bank transfer"], ["upi", "UPI"]] as const).map(([k, label]) => (
                  <Pressable
                    key={k}
                    onPress={() => setMethod(k)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 11, borderColor: method === k ? colors.gold : colors.border, backgroundColor: method === k ? colors.goldSoft : colors.surface }}
                  >
                    <Ionicons name={method === k ? "radio-button-on" : "radio-button-off"} size={17} color={method === k ? colors.goldDark : colors.inkFaint} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              <Section title="Amount paid (₹)" />
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
                placeholder={minAdvance != null ? String(Math.round(minAdvance)) : "Amount"}
                placeholderTextColor={colors.inkFaint}
                style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: "700" }}
              />

              <Section title="Transaction ID / UTR" />
              <TextInput
                value={txn}
                onChangeText={setTxn}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="e.g. 425612345678 or UTR from your bank"
                placeholderTextColor={colors.inkFaint}
                style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: colors.ink }}
              />

              <Section title="Payment proof" />
              <Pressable
                onPress={attachProof}
                disabled={uploading}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderStyle: proof ? "solid" : "dashed", borderColor: proof ? colors.success : colors.border, borderRadius: 12, padding: 12, backgroundColor: proof ? colors.successSoft : colors.surface, opacity: uploading ? 0.6 : 1 }}
              >
                {proof ? (
                  <Image source={{ uri: proof.uri }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceAlt }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="image-outline" size={20} color={colors.inkFaint} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>
                    {uploading ? "Uploading…" : proof ? "Screenshot attached" : "Attach a screenshot or photo"}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.inkFaint }}>
                    {proof ? "Tap to replace" : "The confirmation screen from your bank or UPI app"}
                  </Text>
                </View>
                {proof ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
              </Pressable>

              <Text style={{ fontSize: 11, color: colors.inkFaint, lineHeight: 16, marginTop: 12 }}>
                Recording a payment does not confirm the plot by itself. Our desk verifies the transfer and
                you are notified when it is approved; the status stays Pending until then.
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 8 }}>
                <Pressable onPress={() => setStep(held ? "done" : "detail")} disabled={busy} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>Back</Text>
                </Pressable>
                <Pressable onPress={submitAdvance} disabled={busy || uploading} style={{ flex: 2, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center", opacity: busy || uploading ? 0.6 : 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#1B1405" }}>{busy ? "Recording…" : "Submit for verification"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : step === "paid" && paid ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: "center", paddingVertical: 18 }}>
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="hourglass-outline" size={30} color={colors.goldDark} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink, marginTop: 12 }}>Advance recorded</Text>
                <Text style={{ fontSize: 13, color: colors.inkFaint, marginTop: 4 }}>Reference {paid.ref} · Pending verification</Text>
              </View>
              <Row label="Plot" value={`${plot.plot}${plot.block ? ` · Block ${plot.block}` : ""}`} />
              <Row label="Amount" value={formatINR(Number(String(payAmount).replace(/[^\d.]/g, "")) || 0)} />
              <Row label="Transaction ID" value={txn.trim()} />
              <Row label="Proof" value={proof ? "Attached" : "Not attached"} />
              <Text style={{ fontSize: 12.5, color: colors.inkFaint, lineHeight: 19, marginTop: 14 }}>
                Our desk checks the transfer against the bank statement and approves it, usually within a
                working day. You will be notified, and the status here changes to Approved.
              </Text>
              <Pressable onPress={close} style={{ marginTop: 20, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
                <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>Done</Text>
              </Pressable>
            </ScrollView>
          ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: price ? 27 : 18, fontWeight: "800", color: price ? colors.ink : colors.inkFaint, letterSpacing: -0.5 }}>
                {price ? formatINR(price) : "Pricing on request"}
              </Text>
              {wasPrice ? <Text style={{ fontSize: 14, color: colors.inkFaint, textDecorationLine: "line-through" }}>{formatINR(wasPrice)}</Text> : null}
            </View>

            <Section title="Plot record" />
            <Row label="Plot number" value={plot.plot} />
            {plot.block ? <Row label="Block" value={plot.block} /> : null}
            {plot.size_sqft ? <Row label="Area" value={`${plot.size_sqft.toLocaleString("en-IN")} sq.ft`} /> : null}
            {sqm ? <Row label="Area (m²)" value={`${sqm.toFixed(2)} m²`} /> : null}
            {plot.dim_m ? <Row label="Dimensions" value={`${plot.dim_m} m`} /> : null}
            {plot.facing ? <Row label="Facing" value={plot.facing} /> : null}
            {plot.road_m ? <Row label="Road width" value={`${plot.road_m.toFixed(2)} m`} /> : null}
            <Row label="Corner plot" value={plot.corner ? "Yes" : "No"} />
            <Text style={{ fontSize: 10.5, color: colors.inkFaint, marginTop: 8, lineHeight: 15 }}>
              Facing and corner status are read from the plan and are not part of the DTCP approval.
            </Text>

            {price ? (
              <>
                <Section title="Cost breakdown" />
                <Row label="Plot price" value={formatINR(price)} />
                {num(plot.booking_amount) ? <Row label="Booking amount" value={formatINR(num(plot.booking_amount)!)} /> : null}
                {reg ? <Row label="Registration charges" value={formatINR(reg)} /> : null}
                {dev ? <Row label="Development charges" value={formatINR(dev)} /> : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 11 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Total cost</Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.gold }}>{formatINR(total)}</Text>
                </View>
                <View style={{ marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ fontSize: 11.5, color: colors.inkFaint }}>Indicative EMI</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink, marginVertical: 2 }}>{formatINR(Math.round(indicativeEmi(total)))} / month</Text>
                  <Text style={{ fontSize: 10.5, color: colors.inkFaint, lineHeight: 15 }}>
                    20% down · 8.5% p.a. · 20 years. Indicative only — not an offer of finance.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Section title="Cost" />
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 4 }}>Pricing for this layout is not published yet.</Text>
                  <Text style={{ fontSize: 12.5, color: colors.inkFaint, lineHeight: 19 }}>
                    Every measurement above is confirmed against the sanctioned drawing. Talk to the
                    sales desk for the current rate and charges on plot {plot.plot}.
                  </Text>
                </View>
              </>
            )}

            {/* The buyer's own advance on this plot, whatever its state (0096). */}
            {myAdvance ? (
              <>
                <Section title="Your advance payment" />
                <AdvanceCard row={myAdvance} />
              </>
            ) : null}

            {approvalNo || property.rera_number ? (
              <>
                <Section title="Approval" />
                {approvalNo ? <Row label="DTCP application" value={approvalNo} /> : null}
                {property.plot_plan?.scale ? <Row label="Drawing scale" value={property.plot_plan.scale} /> : null}
                {property.survey_number ? <Row label="Survey nos." value={property.survey_number} /> : null}
                {property.village || property.taluk ? <Row label="Village / Taluk" value={[property.village, property.taluk].filter(Boolean).join(" / ")} /> : null}
                {property.rera_number ? <Row label="RERA" value={property.rera_number} /> : null}
              </>
            ) : null}

            {links ? (
              <>
                <Section title="See the site" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Action grid accent={ACCENT.map} icon="map-outline" label="Map" onPress={() => openExternal(links.maps)} />
                  <Action grid accent={ACCENT.satellite} icon="globe-outline" label="Satellite" onPress={() => openExternal(links.satellite)} />
                  <Action grid accent={ACCENT.street} icon="eye-outline" label="Street view" onPress={() => openExternal(links.streetView)} />
                  <Action grid accent={ACCENT.earth} icon="earth-outline" label="Earth" onPress={() => openExternal(links.earth)} />
                </View>
                <Text style={{ fontSize: 11, color: colors.inkFaint, marginTop: 7 }}>Site pin {links.coords}</Text>
              </>
            ) : null}

            {landmarks.length ? (
              <>
                <Section title="Nearby" />
                {/* One landmark per row — name left, distance right — so the
                    list scans in a straight line instead of a ragged block of
                    chips whose lengths never line up. Matches the property
                    screen's Nearby card. */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 12 }}>
                  {landmarks.map((l, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9,
                        borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border,
                      }}
                    >
                      <Ionicons name="location" size={15} color={colors.brand} />
                      <Text style={{ flex: 1, fontSize: 13, color: colors.ink }} numberOfLines={2}>{l.label}</Text>
                      {l.distance ? (
                        <Text style={{ fontSize: 12, color: colors.inkFaint }}>{l.distance}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {gallery.length ? (
              <>
                <Section title="Gallery" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {gallery.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={{ width: 128, height: 96, borderRadius: 12, backgroundColor: colors.surfaceAlt }} resizeMode="cover" />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {videos.length || property.brochure_url || (property.documents ?? []).length ? (
              <>
                <Section title="Documents & media" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {property.brochure_url ? <Action grid accent={ACCENT.brochure} icon="document-text-outline" label="Brochure" onPress={() => openExternal(property.brochure_url)} /> : null}
                  {videos.length ? <Action grid accent={ACCENT.video} icon="videocam-outline" label={`Videos (${videos.length})`} onPress={() => openExternal(videos[0])} /> : null}
                  {(property.documents ?? []).map((d, i) => (
                    <Action key={i} grid accent={ACCENT.doc} icon="folder-open-outline" label={d.label || "Document"} onPress={() => openExternal(d.url)} />
                  ))}
                </View>
              </>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark" size={13} color="#fff" />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.goldDark }}>Verified Jamin Partner listing</Text>
            </View>

            <Section title="Enquire" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Action grid accent={ACCENT.share} icon="share-social-outline" label="Share" onPress={share} />
              <Action grid accent={ACCENT.qr} icon="qr-code-outline" label="QR" onPress={() => setShowQR((v) => !v)} />
              {link ? (
                <Action
                  grid
                  accent={ACCENT.copy}
                  icon="copy-outline"
                  label="Copy link"
                  onPress={async () => {
                    await Clipboard.setStringAsync(link);
                    Alert.alert("Copied", "Link copied to clipboard.");
                  }}
                />
              ) : null}
            </View>

            {showQR && link ? (
              <View style={{ alignItems: "center", marginTop: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}>
                <QRCode value={link} size={158} />
                <Text style={{ fontSize: 11.5, color: colors.inkFaint, marginTop: 9 }}>
                  Plot {plot.plot} · {property.title}
                </Text>
              </View>
            ) : null}

            <Text style={{ fontSize: 10.5, color: colors.inkFaint, marginTop: 20, marginBottom: 8, lineHeight: 16 }}>
              Sizes and areas are quoted from the sanctioned plot schedule
              {approvalNo ? ` (application ${approvalNo})` : ""}.
            </Text>
          </ScrollView>
          )}

          {step === "detail" && status === "available" ? (
            <Pressable
              onPress={() => setStep("confirm")}
              style={{ marginTop: 12, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
            >
              <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>Book plot {plot.plot}</Text>
            </Pressable>
          ) : null}

          {/* An on-hold plot the caller can release themselves (bug report 22).
              `liveHold` is only ever their own hold unless they are an admin, so
              the wording changes to say whose hold is being released. */}
          {/* My hold, advance offered, nothing recorded yet (or the last one was
              rejected): the payment step is one tap from the plot itself. */}
          {step === "detail" && status === "reserved" && liveHold && liveHold.buyer_id === profile?.id
            && advanceOffered && (!myAdvance || myAdvance.status === "rejected") ? (
            <Pressable
              onPress={openPay}
              style={{ marginTop: 12, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
            >
              <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>
                {myAdvance?.status === "rejected" ? "Record the advance again" : `Pay the advance for plot ${plot.plot}`}
              </Text>
              <Text style={{ color: "#1B1405", fontSize: 11.5, marginTop: 3, opacity: 0.8 }}>
                {minAdvance != null ? `Minimum ${formatINR(minAdvance)} · ` : ""}hold {liveHold.ref}
              </Text>
            </Pressable>
          ) : null}

          {step === "detail" && status === "reserved" && liveHold ? (
            <Pressable
              onPress={() => withdrawHold(liveHold.id)}
              disabled={busy}
              style={{ marginTop: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surface, opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: "800" }}>
                {busy
                  ? "Withdrawing…"
                  : liveHold.buyer_id === profile?.id
                    ? `Withdraw my hold on plot ${plot.plot}`
                    : `Release hold ${liveHold.ref}`}
              </Text>
              <Text style={{ color: colors.inkFaint, fontSize: 11.5, marginTop: 3 }}>
                Reference {liveHold.ref} · the plot returns to sale immediately
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export { mapLinks };
