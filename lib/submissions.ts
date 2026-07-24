// Promoter Lead Capture — client helpers (migration 0018). Photos upload to the
// public 'submissions' bucket under the user's own folder; the row enters the
// admin approval workflow. Uses the base64→bytes upload path (avoids the
// Storage Blob-mime gotcha).
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { supabase } from "./supabase";

export type SubmissionStatus = "submitted" | "under_review" | "info_required" | "approved" | "rejected";

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger"; icon: string }> = {
  submitted: { label: "Submitted", tone: "info", icon: "paper-plane" },
  under_review: { label: "Under review", tone: "warning", icon: "search" },
  info_required: { label: "Info required", tone: "warning", icon: "alert-circle" },
  approved: { label: "Approved", tone: "success", icon: "checkmark-circle" },
  rejected: { label: "Rejected", tone: "danger", icon: "close-circle" },
};

export interface SubmissionDoc { label: string; url: string }

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
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(base64: string): Uint8Array {
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

/** Pick multiple photos and upload them; returns their public URLs. */
export async function pickAndUploadPhotos(): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Please allow photo access.");
  const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, quality: 0.7, base64: true, selectionLimit: 10 });
  if (res.canceled) return [];
  const uid = await currentUid();
  const urls: string[] = [];
  for (const asset of res.assets) {
    if (!asset.base64) continue;
    const bytes = base64ToBytes(asset.base64);
    const mime = asset.mimeType || "image/jpeg";
    const ext = (mime.split("/")[1] || "jpg").split("+")[0];
    const path = `${uid}/${Date.now()}_${urls.length}.${ext}`;
    const { error } = await supabase.storage.from("submissions").upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw error;
    urls.push(supabase.storage.from("submissions").getPublicUrl(path).data.publicUrl);
  }
  return urls;
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
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Submission;
}
