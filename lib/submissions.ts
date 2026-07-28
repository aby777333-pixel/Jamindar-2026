// Promoter Lead Capture — client helpers (migration 0018 + 0040). Photos,
// videos and documents upload to the public 'submissions' bucket under the
// user's own folder; the row enters the admin approval workflow. Uses the
// base64→bytes upload path (avoids the Storage Blob-mime gotcha).
import * as DocumentPicker from "expo-document-picker";
// SDK 54+: readAsStringAsync/getInfoAsync live only on the legacy entry.
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { supabase } from "./supabase";

/** Project-wide Supabase Storage cap — uploads above this 413 at the gateway. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type SubmissionStatus = "submitted" | "under_review" | "info_required" | "approved" | "rejected";

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger"; icon: string }> = {
  submitted: { label: "Submitted", tone: "info", icon: "paper-plane" },
  under_review: { label: "Under review", tone: "warning", icon: "search" },
  info_required: { label: "Info required", tone: "warning", icon: "alert-circle" },
  approved: { label: "Approved", tone: "success", icon: "checkmark-circle" },
  rejected: { label: "Rejected", tone: "danger", icon: "close-circle" },
};

export interface SubmissionDoc { label: string; url: string }

export interface PickedMedia {
  images: string[];
  videos: string[];
  /** Files skipped because they exceed the upload size cap. */
  skipped: string[];
}

export interface PickedDocs {
  docs: SubmissionDoc[];
  skipped: string[];
}

export interface Submission {
  id: string;
  promoter_id: string;
  title: string | null;
  property_type: string | null;
  description: string | null;
  price: number | null;
  area_value: number | null;
  area_unit: string | null;
  address: string | null;
  locality: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  gmaps_url: string | null;
  street_view_url: string | null;
  images: string[];
  videos: string[];
  documents: SubmissionDoc[];
  seller_name: string | null;
  seller_phone: string | null;
  seller_notes: string | null;
  notes: string | null;
  comments: string | null;
  status: SubmissionStatus;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionInput {
  title: string;
  property_type?: string;
  description?: string;
  price?: number | null;
  area_value?: number | null;
  area_unit?: string;
  address?: string;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  lat?: number | null;
  lng?: number | null;
  gmaps_url?: string;
  street_view_url?: string;
  images?: string[];
  videos?: string[];
  documents?: SubmissionDoc[];
  seller_name?: string;
  seller_phone?: string;
  seller_notes?: string;
  notes?: string;
  comments?: string;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64ToBytes(base64: string): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) lut[B64.charCodeAt(i)] = i;
  const len = base64.length;
  let n = len * 0.75;
  if (base64[len - 1] === "=") { n--; if (base64[len - 2] === "=") n--; }
  const b = new Uint8Array(n);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lut[base64.charCodeAt(i)], e2 = lut[base64.charCodeAt(i + 1)], e3 = lut[base64.charCodeAt(i + 2)], e4 = lut[base64.charCodeAt(i + 3)];
    b[p++] = (e1 << 2) | (e2 >> 4);
    if (p < n) b[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < n) b[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return b;
}

async function currentUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Not signed in.");
  return uid;
}

/** Read any picker asset URI into bytes (native file:// via legacy FS, web blob:/data: via fetch). */
export async function readUriBytes(uri: string): Promise<Uint8Array> {
  if (uri.startsWith("file://") || uri.startsWith("content://")) {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    return base64ToBytes(b64);
  }
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

/** Best-effort byte size of a picked asset (undefined when the platform won't say). */
export async function assetSize(uri: string, reported?: number | null): Promise<number | undefined> {
  if (reported && reported > 0) return reported;
  try {
    if (uri.startsWith("file://")) {
      const info = await FileSystem.getInfoAsync(uri);
      const size = info.exists ? (info as { size?: number }).size : undefined;
      if (typeof size === "number") return size;
    }
  } catch {
    /* size stays unknown — the storage gateway is the final guard */
  }
  return undefined;
}

async function uploadToSubmissions(uid: string, tag: string, bytes: Uint8Array, mime: string, ext: string): Promise<string> {
  const path = `${uid}/${Date.now()}_${tag}.${ext}`;
  const { error } = await supabase.storage.from("submissions").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  return supabase.storage.from("submissions").getPublicUrl(path).data.publicUrl;
}

/** Pick multiple photos and upload them; returns their public URLs. */
export async function pickAndUploadPhotos(): Promise<string[]> {
  const res = await pickAndUploadMedia(["images"]);
  return res.images;
}

/**
 * Pick photos AND videos straight from the phone and upload them (owner
 * request 2026-07-28 — no more link-only videos). Oversize files are skipped
 * with their names reported so the caller can tell the user.
 */
export async function pickAndUploadMedia(
  kinds: ("images" | "videos")[] = ["images", "videos"],
): Promise<PickedMedia> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Please allow photo & video access.");
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kinds,
    allowsMultipleSelection: true,
    quality: 0.7,
    base64: true,
    selectionLimit: 10,
  });
  if (res.canceled) return { images: [], videos: [], skipped: [] };
  const uid = await currentUid();
  const out: PickedMedia = { images: [], videos: [], skipped: [] };
  let n = 0;
  for (const asset of res.assets) {
    const isVideo = asset.type === "video";
    const size = await assetSize(asset.uri, asset.fileSize);
    if (size && size > MAX_UPLOAD_BYTES) {
      out.skipped.push(asset.fileName || (isVideo ? "video" : "photo"));
      continue;
    }
    const mime = asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
    const ext = (mime.split("/")[1] || (isVideo ? "mp4" : "jpg")).split("+")[0];
    const bytes = !isVideo && asset.base64 ? base64ToBytes(asset.base64) : await readUriBytes(asset.uri);
    const url = await uploadToSubmissions(uid, String(n++), bytes, mime, ext);
    (isVideo ? out.videos : out.images).push(url);
  }
  return out;
}

/** Pick documents (PDF, images, office files…) and upload them as labelled docs. */
export async function pickAndUploadDocuments(): Promise<PickedDocs> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return { docs: [], skipped: [] };
  const uid = await currentUid();
  const out: PickedDocs = { docs: [], skipped: [] };
  let n = 0;
  for (const asset of res.assets) {
    const size = await assetSize(asset.uri, asset.size);
    if (size && size > MAX_UPLOAD_BYTES) {
      out.skipped.push(asset.name || "document");
      continue;
    }
    const mime = asset.mimeType || "application/octet-stream";
    const name = (asset.name || "document").replace(/[^\w.\-]+/g, "_");
    const ext = name.includes(".") ? name.split(".").pop()! : (mime.split("/")[1] || "bin").split("+")[0];
    const bytes = await readUriBytes(asset.uri);
    const url = await uploadToSubmissions(uid, `doc_${n++}_${name.replace(/\.[^.]*$/, "")}`, bytes, mime, ext);
    out.docs.push({ label: asset.name || "Document", url });
  }
  return out;
}

/** Capture the device's current GPS coordinates. */
export async function captureLocation(): Promise<{ lat: number; lng: number }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error("Please allow location access.");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export async function fetchMySubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase.from("property_submissions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Submission[]) ?? [];
}

export async function createSubmission(input: SubmissionInput): Promise<Submission> {
  const uid = await currentUid();
  const { data, error } = await supabase
    .from("property_submissions")
    .insert({
      promoter_id: uid,
      title: input.title,
      property_type: input.property_type ?? null,
      description: input.description ?? null,
      price: input.price ?? null,
      area_value: input.area_value ?? null,
      area_unit: input.area_unit ?? null,
      address: input.address ?? null,
      locality: input.locality ?? null,
      city: input.city ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      gmaps_url: input.gmaps_url ?? null,
      street_view_url: input.street_view_url ?? null,
      images: input.images ?? [],
      videos: input.videos ?? [],
      documents: input.documents ?? [],
      seller_name: input.seller_name ?? null,
      seller_phone: input.seller_phone ?? null,
      seller_notes: input.seller_notes ?? null,
      notes: input.notes ?? null,
      comments: input.comments ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Submission;
}
