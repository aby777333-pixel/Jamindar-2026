// Buyer-module foundation (migration 0006) — client helpers for the
// acquisition-source capture and the immutable audit spine.
// Every call is fire-and-forget and swallows errors: telemetry must never
// break a user flow.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { AcquisitionSource } from "./types";

const PENDING_KEY = "jamin.pending_acquisition";

export type PendingAcquisition = {
  source: AcquisitionSource;
  referral_code?: string | null;
  campaign?: string | null;
  medium?: string | null;
  property_id?: string | null;
  meta?: Record<string, unknown>;
};

/** Persist the entry source before the user has registered (deep link / QR / ad). */
export async function setPendingAcquisition(p: PendingAcquisition): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* non-critical */
  }
}

/** Fire-and-forget immutable audit log entry. No-ops when signed out. */
export async function logActivity(
  event: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.rpc("log_activity", { p_event: event, p_meta: meta });
  } catch {
    /* non-critical */
  }
}

/** Record an acquisition event (safe pre- or post-registration). */
export async function captureAcquisition(
  p: PendingAcquisition & { mobile?: string | null }
): Promise<void> {
  try {
    await supabase.rpc("capture_acquisition", {
      p_source: p.source,
      p_mobile: p.mobile ?? null,
      p_medium: p.medium ?? null,
      p_campaign: p.campaign ?? null,
      p_referral_code: p.referral_code ?? null,
      p_property_id: p.property_id ?? null,
      p_meta: p.meta ?? {},
    });
  } catch {
    /* non-critical */
  }
}

/**
 * After a successful login, flush any stored pre-registration acquisition:
 * credit the referrer (one-time), log the acquisition event, then clear it.
 */
export async function flushPendingAcquisition(mobile?: string | null): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as PendingAcquisition;
    // one-time attribution: sets referred_by + acquisition_source, credits the referrer
    await supabase
      .rpc("attach_referral", { p_code: p.referral_code ?? null, p_source: p.source ?? "organic", p_meta: p.meta ?? {} })
      .then(() => {}, () => {});
    await captureAcquisition({ ...p, mobile });
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    /* non-critical */
  }
}
