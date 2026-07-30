import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { Alert, Image, Linking, Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { colors } from "../lib/theme";
import { formatINR } from "../lib/format";
import type { Property } from "../lib/types";
import type { PlotRow } from "./PlotPlan";

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

function Section({ title }: { title: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.inkFaint, marginTop: 22, marginBottom: 2 }}>
      {title}
    </Text>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }}
    >
      <Ionicons name={icon} size={14} color={colors.ink} />
      <Text style={{ fontSize: 12.5, color: colors.ink, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function PlotSheet({
  visible,
  plot,
  property,
  shareUrl,
  onClose,
  onBook,
}: {
  visible: boolean;
  plot: PlotRow | null;
  property: Property;
  shareUrl?: string;
  onClose: () => void;
  onBook?: (p: PlotRow) => void;
}) {
  const insets = useSafeAreaInsets();
  const [showQR, setShowQR] = useState(false);

  const links = useMemo(() => mapLinks(property), [property]);
  if (!plot) return null;

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
        <Pressable style={{ flex: 1 }} onPress={onClose} />
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
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.inkFaint} />
            </Pressable>
          </View>

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
                  <Action icon="map-outline" label="Map" onPress={() => WebBrowser.openBrowserAsync(links.maps).catch(() => {})} />
                  <Action icon="globe-outline" label="Satellite" onPress={() => WebBrowser.openBrowserAsync(links.satellite).catch(() => {})} />
                  <Action icon="eye-outline" label="Street view" onPress={() => WebBrowser.openBrowserAsync(links.streetView).catch(() => {})} />
                  <Action icon="earth-outline" label="Earth" onPress={() => WebBrowser.openBrowserAsync(links.earth).catch(() => {})} />
                </View>
                <Text style={{ fontSize: 11, color: colors.inkFaint, marginTop: 7 }}>Site pin {links.coords}</Text>
              </>
            ) : null}

            {landmarks.length ? (
              <>
                <Section title="Nearby" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                  {landmarks.map((l, i) => (
                    <View key={i} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: colors.surfaceAlt }}>
                      <Text style={{ fontSize: 11.5, color: colors.inkFaint }}>{l.distance ? `${l.label} · ${l.distance}` : l.label}</Text>
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
                  {property.brochure_url ? <Action icon="document-text-outline" label="Brochure" onPress={() => WebBrowser.openBrowserAsync(property.brochure_url!).catch(() => {})} /> : null}
                  {videos.length ? <Action icon="videocam-outline" label={`Videos (${videos.length})`} onPress={() => WebBrowser.openBrowserAsync(videos[0]).catch(() => {})} /> : null}
                  {(property.documents ?? []).map((d, i) => (
                    <Action key={i} icon="folder-open-outline" label={d.label || "Document"} onPress={() => WebBrowser.openBrowserAsync(d.url).catch(() => {})} />
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
              <Action icon="share-social-outline" label="Share" onPress={share} />
              <Action icon="qr-code-outline" label="QR" onPress={() => setShowQR((v) => !v)} />
              {link ? (
                <Action
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

          {status === "available" && onBook ? (
            <Pressable
              onPress={() => onBook(plot)}
              style={{ marginTop: 12, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
            >
              <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>Enquire about plot {plot.plot}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export { mapLinks };
