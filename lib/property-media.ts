// Property Management v2 — media library helpers (migration 0012).
// Files live in the public 'property-media' bucket; each file is a row in
// property_media. A DB trigger mirrors buyer-visible media into the legacy
// properties columns, so the buyer app needs no changes.
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
import { jamindarChat } from "./jamindar";
import { PROPERTY_TYPE_LABELS } from "./types";

export const MEDIA_KINDS: { key: string; label: string; group: "media" | "document" }[] = [
  { key: "image", label: "Photo", group: "media" },
  { key: "video", label: "Video", group: "media" },
  { key: "drone", label: "Drone video", group: "media" },
  { key: "virtual_tour", label: "360° / Virtual tour", group: "media" },
  { key: "brochure", label: "Brochure", group: "document" },
  { key: "flyer", label: "Flyer", group: "document" },
  { key: "pamphlet", label: "Pamphlet", group: "document" },
  { key: "catalogue", label: "Catalogue", group: "document" },
  { key: "presentation", label: "Sales presentation", group: "document" },
  { key: "price_list", label: "Price list", group: "document" },
  { key: "master_plan", label: "Master plan", group: "document" },
  { key: "layout_plan", label: "Layout plan", group: "document" },
  { key: "floor_plan", label: "Floor plan", group: "document" },
  { key: "site_plan", label: "Site plan", group: "document" },
  { key: "location_map", label: "Location map", group: "document" },
  { key: "google_earth", label: "Google Earth", group: "document" },
  { key: "legal", label: "Legal document", group: "document" },
  { key: "approval", label: "Approval certificate", group: "document" },
  { key: "rera", label: "RERA document", group: "document" },
  { key: "noc", label: "NOC", group: "document" },
  { key: "other", label: "Other", group: "document" },
];
export const AUDIENCES = ["buyer", "promoter", "agent", "internal"] as const;

export interface PropertyMedia {
  id: string; property_id: string; kind: string; url: string;
  caption: string | null; alt_text: string | null; sort_order: number;
  is_primary: boolean; visibility: string[]; version: number; created_at: string;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(base64: string): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) lut[B64.charCodeAt(i)] = i;
  const len = base64.length; let n = len * 0.75;
  if (base64[len - 1] === "=") { n--; if (base64[len - 2] === "=") n--; }
  const b = new Uint8Array(n); let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lut[base64.charCodeAt(i)], e2 = lut[base64.charCodeAt(i + 1)], e3 = lut[base64.charCodeAt(i + 2)], e4 = lut[base64.charCodeAt(i + 3)];
    b[p++] = (e1 << 2) | (e2 >> 4);
    if (p < n) b[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < n) b[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return b;
}

export async function listMedia(propertyId: string): Promise<PropertyMedia[]> {
  const { data } = await supabase.from("property_media").select("*").eq("property_id", propertyId).order("sort_order").order("created_at");
  return (data as PropertyMedia[]) ?? [];
}

async function uploadFile(propertyId: string, base64: string, mime: string): Promise<string> {
  const bytes = base64ToBytes(base64);
  const ext = (mime.split("/")[1] || "jpg").split("+")[0];
  const path = `${propertyId}/${Date.now()}_${Math.round(bytes.length % 100000)}.${ext}`;
  const { error } = await supabase.storage.from("property-media").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  return supabase.storage.from("property-media").getPublicUrl(path).data.publicUrl;
}

/** Pick multiple photos and add them as image rows. Returns how many were added. */
export async function pickAndAddImages(propertyId: string, kind = "image"): Promise<number> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Please allow photo access.");
  const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, quality: 0.7, base64: true, selectionLimit: 12 });
  if (res.canceled) return 0;
  const existing = await listMedia(propertyId);
  const hasPrimary = existing.some((m) => m.kind === "image" && m.is_primary);
  let order = existing.reduce((mx, m) => Math.max(mx, m.sort_order), 0);
  let added = 0;
  for (const asset of res.assets) {
    if (!asset.base64) continue;
    const url = await uploadFile(propertyId, asset.base64, asset.mimeType || "image/jpeg");
    order += 1;
    await supabase.from("property_media").insert({
      property_id: propertyId, kind, url, sort_order: order,
      is_primary: kind === "image" && !hasPrimary && added === 0,
    });
    added += 1;
  }
  return added;
}

/** Add an external link (e.g. a 360° tour) or a hosted document URL. */
export async function addLink(propertyId: string, kind: string, url: string, caption?: string): Promise<void> {
  const existing = await listMedia(propertyId);
  const order = existing.reduce((mx, m) => Math.max(mx, m.sort_order), 0) + 1;
  const { error } = await supabase.from("property_media").insert({ property_id: propertyId, kind, url: url.trim(), caption: caption?.trim() || null, sort_order: order });
  if (error) throw error;
}

export async function setPrimary(propertyId: string, id: string): Promise<void> {
  await supabase.from("property_media").update({ is_primary: false }).eq("property_id", propertyId).eq("kind", "image");
  await supabase.from("property_media").update({ is_primary: true }).eq("id", id);
}

export async function moveMedia(list: PropertyMedia[], id: string, dir: -1 | 1): Promise<void> {
  const i = list.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i], b = list[j];
  await supabase.from("property_media").update({ sort_order: b.sort_order }).eq("id", a.id);
  await supabase.from("property_media").update({ sort_order: a.sort_order }).eq("id", b.id);
}

export async function removeMedia(id: string): Promise<void> {
  const { error } = await supabase.from("property_media").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMedia(id: string, patch: Partial<Pick<PropertyMedia, "caption" | "alt_text" | "kind" | "visibility">>): Promise<void> {
  const { error } = await supabase.from("property_media").update(patch).eq("id", id);
  if (error) throw error;
}

/** AI-drafted property description from the entered fields (uses Jamindar). */
export async function generateDescription(fields: {
  title?: string; property_type?: string; city?: string; locality?: string; state?: string;
  price?: string; area_value?: string; area_unit?: string; vastu_facing?: string; amenities?: string;
}): Promise<string> {
  const type = fields.property_type ? PROPERTY_TYPE_LABELS[fields.property_type as keyof typeof PROPERTY_TYPE_LABELS] ?? fields.property_type : "property";
  const bits = [
    `Type: ${type}`,
    fields.title && `Name: ${fields.title}`,
    [fields.locality, fields.city, fields.state].filter(Boolean).join(", ") && `Location: ${[fields.locality, fields.city, fields.state].filter(Boolean).join(", ")}`,
    fields.price && `Price: ₹${fields.price}`,
    fields.area_value && `Area: ${fields.area_value} ${fields.area_unit ?? ""}`,
    fields.vastu_facing && `Facing: ${fields.vastu_facing}`,
    fields.amenities && `Amenities: ${fields.amenities}`,
  ].filter(Boolean).join("\n");
  const prompt = `Write a warm, credible 60-80 word marketing description for this Indian real-estate listing. Highlight location advantages and lifestyle; do not invent facts not given. Plain text, no headings.\n\n${bits}`;
  return jamindarChat([{ role: "user", content: prompt }], { language: "en-IN" });
}
