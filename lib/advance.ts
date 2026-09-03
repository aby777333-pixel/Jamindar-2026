// Advance payments (migration 0096) — client helpers.
//
// Jamin Bazaar takes money by bank transfer / UPI, never through a gateway.
// A buyer pays the project's minimum advance from their own bank app, then
// records it here: the amount, the transaction id (UTR) and a proof image.
// The row is `pending` until the desk verifies it against the statement and
// approves or rejects it; the buyer sees the status change in the plot sheet
// and gets a notification. Nothing here changes a plot's status — that stays
// the desk's explicit action, exactly as it was before this module existed.
import { supabase } from "./supabase";

export type AdvanceStatus = "pending" | "approved" | "rejected";

export interface AdvancePayment {
  id: string;
  ref: string;
  property_id: string;
  plot: string | null;
  hold_id: string | null;
  amount: number;
  method: "bank" | "upi";
  transaction_id: string;
  proof_path: string | null;
  proof_name: string | null;
  status: AdvanceStatus;
  remarks: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface BankAccount {
  bank_name?: string;
  account_name?: string;
  account_no?: string;
  ifsc?: string;
  branch?: string;
  account_type?: string;
}

/** The buyer's most recent advance for this property (and plot, when given). */
export async function fetchMyAdvance(
  buyerId: string,
  propertyId: string,
  plot: string | null,
): Promise<AdvancePayment | null> {
  let q = supabase
    .from("advance_payments")
    .select("id, ref, property_id, plot, hold_id, amount, method, transaction_id, proof_path, proof_name, status, remarks, created_at, decided_at")
    .eq("buyer_id", buyerId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(1);
  // ⚠️ jsonb plot ids arrive as numbers at runtime though the column is text —
  // compare on the string form, never on the typed value.
  if (plot != null) q = q.eq("plot", String(plot));
  const { data } = await q.maybeSingle();
  return (data as AdvancePayment | null) ?? null;
}

/** Every advance the buyer has recorded, newest first (buyer dashboard). */
export async function fetchMyAdvances(buyerId: string): Promise<AdvancePayment[]> {
  const { data } = await supabase
    .from("advance_payments")
    .select("id, ref, property_id, plot, hold_id, amount, method, transaction_id, proof_path, proof_name, status, remarks, created_at, decided_at")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as AdvancePayment[] | null) ?? [];
}

// ── proof upload ──────────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standalone base64 → bytes (mirrors lib/kyc.ts; no atob / file-system dependency). */
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

export interface UploadedProof {
  path: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Upload the payment proof to the private `payment-proofs` bucket under the
 * buyer's own folder. The RPC validates that the path starts with the
 * caller's uid, so the shape here is part of the contract:
 * `<uid>/advance_<ts>.<ext>`.
 */
export async function uploadPaymentProof(
  userId: string,
  base64: string,
  mimeType?: string | null,
): Promise<UploadedProof> {
  const bytes = base64ToBytes(base64);
  const mime = mimeType || "image/jpeg";
  const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
  const name = `advance_${Date.now()}.${ext}`;
  const path = `${userId}/${name}`;
  const { error } = await supabase.storage.from("payment-proofs").upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;
  return { path, name, type: mime, size: bytes.length };
}

export interface SubmitAdvanceArgs {
  propertyId: string;
  amount: number;
  transactionId: string;
  plot?: string | null;
  holdId?: string | null;
  method?: "bank" | "upi";
  proof?: UploadedProof | null;
}

/** Record the advance. Server-side checks: amount ≥ project minimum, txn id, proof path shape. */
export async function submitAdvancePayment(args: SubmitAdvanceArgs): Promise<{ id: string; ref: string; status: AdvanceStatus }> {
  const { data, error } = await supabase.rpc("submit_advance_payment", {
    p_property: args.propertyId,
    p_amount: args.amount,
    p_transaction_id: args.transactionId,
    p_plot: args.plot ?? null,
    p_hold: args.holdId ?? null,
    p_method: args.method ?? "bank",
    p_proof_path: args.proof?.path ?? null,
    p_proof_name: args.proof?.name ?? null,
    p_proof_type: args.proof?.type ?? null,
    p_proof_size: args.proof?.size ?? null,
  });
  if (error) throw error;
  return data as { id: string; ref: string; status: AdvanceStatus };
}

export const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  pending: "Pending verification",
  approved: "Approved",
  rejected: "Not accepted",
};
