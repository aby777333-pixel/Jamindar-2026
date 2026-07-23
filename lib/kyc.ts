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
