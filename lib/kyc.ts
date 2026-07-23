// Buyer-module KYC (migrations 0008/0009) — client helpers.
// Submission goes through the submit_kyc() SECURITY DEFINER RPC so the profile
// status flip is server-controlled (clients can never self-approve).
import { supabase } from "./supabase";
import type { KycSubmission } from "./types";

/** All textual KYC fields. Document paths are added by the upload step (next increment). */
export type KycPayload = {
  pan_number?: string | null;
  aadhaar_number?: string | null;
  pan_doc?: string | null;
  aadhaar_front?: string | null;
  aadhaar_back?: string | null;
  addr_house?: string | null;
  addr_street?: string | null;
  addr_landmark?: string | null;
  addr_area?: string | null;
  addr_city?: string | null;
  addr_district?: string | null;
  addr_state?: string | null;
  addr_country?: string | null;
  addr_pincode?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_proof?: string | null;
  upi_id?: string | null;
  nominee_name?: string | null;
  nominee_relationship?: string | null;
  nominee_phone?: string | null;
  nominee_email?: string | null;
  nominee_address?: string | null;
  nominee_pan?: string | null;
  nominee_aadhaar?: string | null;
  nominee_pan_doc?: string | null;
  nominee_aadhaar_front?: string | null;
  nominee_aadhaar_back?: string | null;
};

/** Most recent KYC submission for a user (null if none). */
export async function fetchMyKyc(userId: string): Promise<KycSubmission | null> {
  const { data } = await supabase
    .from("kyc_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as KycSubmission | null) ?? null;
}

/** Submit (or resubmit) KYC. Returns the new submission id. */
export async function submitKyc(payload: KycPayload): Promise<string> {
  const clean: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(payload)) {
    clean[k] = v == null || v === "" ? null : String(v).trim();
  }
  const { data, error } = await supabase.rpc("submit_kyc", { p_payload: clean });
  if (error) throw error;
  return data as string;
}

// ── document uploads ──────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standalone base64 → bytes (no atob / no file-system dependency). */
function base64ToBytes(base64: string): Uint8Array {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const len = base64.length;
  let bufferLength = len * 0.75;
  if (base64[len - 1] === "=") {
    bufferLength--;
    if (base64[len - 2] === "=") bufferLength--;
  }
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[base64.charCodeAt(i)];
    const e2 = lookup[base64.charCodeAt(i + 1)];
    const e3 = lookup[base64.charCodeAt(i + 2)];
    const e4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

/**
 * Upload a KYC document image to the private `kyc` bucket under the user's own
 * folder (path: `<uid>/<kind>_<ts>.<ext>`) and return its storage path.
 * Bytes + explicit contentType are passed, so Storage never mis-detects mime.
 */
export async function uploadKycDoc(
  userId: string,
  kind: string,
  base64: string,
  mimeType?: string | null
): Promise<string> {
  const bytes = base64ToBytes(base64);
  const mime = mimeType || "image/jpeg";
  const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
  const path = `${userId}/${kind}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("kyc").upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** A short-lived signed URL to view a private KYC document (admin / owner). */
export async function signedKycUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from("kyc").createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
