// Site-visit booking (migration 0020).
// Every mutation goes through a SECURITY DEFINER RPC so that notifications to
// the buyer, the assigned promoter and the admin desk — plus the audit-log
// entry — are written atomically with the booking itself.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Property } from "./types";

export type VisitStatus = "requested" | "confirmed" | "completed" | "cancelled";

export interface VisitSlot {
  id: string;
  label: string;
  hour: number;
  minute: number;
  sort_order: number;
  is_active: boolean;
}

export interface SiteVisit {
  id: string;
  property_id: string | null;
  buyer_id: string | null;
  promoter_id: string | null;
  scheduled_at: string | null;
  slot_label: string | null;
  visit_ref: string | null;
  status: VisitStatus;
  notes: string | null;
  cancel_reason: string | null;
  reschedule_count: number;
  created_at: string;
  property?: Pick<Property, "id" | "title" | "locality" | "city"> | null;
  buyer?: { id: string; full_name: string | null; mobile: string | null } | null;
}

// These four badges hardcode their own colours rather than reading the palette,
// so the contrast work in lib/theme.ts did not reach them: every one was
// failing AA as small text on its own tint (3.0–4.1:1). Same treatment — the
// hue is kept, the value deepened — giving 4.96 / 5.52 / 4.46 / 5.51.
export const VISIT_STATUS_META: Record<VisitStatus, { label: string; bg: string; fg: string }> = {
  requested: { label: "Requested", bg: "#FBF1DC", fg: "#7F6514" },
  confirmed: { label: "Confirmed", bg: "#E8F1FE", fg: "#1C5BC4" },
  completed: { label: "Completed", bg: "#E4F6EC", fg: "#0C8046" },
  cancelled: { label: "Cancelled", bg: "#E9EAEF", fg: "#5C5C64" },
};

const SELECT =
  "*, property:properties!site_visits_property_id_fkey(id,title,locality,city)";

/** Bookable time slots — admin-configurable rows, not a hardcoded list. */
export function useVisitSlots() {
  return useQuery({
    queryKey: ["visit-slots"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VisitSlot[]> => {
      const { data } = await supabase
        .from("site_visit_slots")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return (data as VisitSlot[]) ?? [];
    },
  });
}

/** The signed-in buyer's own visits. */
export function useMyVisits(buyerId?: string | null) {
  return useQuery({
    queryKey: ["visits", "buyer", buyerId],
    enabled: !!buyerId,
    queryFn: async (): Promise<SiteVisit[]> => {
      const { data } = await supabase
        .from("site_visits")
        .select(SELECT)
        .eq("buyer_id", buyerId!)
        .order("created_at", { ascending: false });
      return (data as SiteVisit[]) ?? [];
    },
  });
}

/** Visits assigned to a promoter / agent. */
export function usePromoterVisits(promoterId?: string | null) {
  return useQuery({
    queryKey: ["visits", "promoter", promoterId],
    enabled: !!promoterId,
    queryFn: async (): Promise<SiteVisit[]> => {
      const { data } = await supabase
        .from("site_visits")
        .select(`${SELECT}, buyer:profiles!site_visits_buyer_id_fkey(id,full_name,mobile)`)
        .eq("promoter_id", promoterId!)
        .order("created_at", { ascending: false });
      return (data as SiteVisit[]) ?? [];
    },
  });
}

/** Every visit — super admin only (RLS enforces it). */
export function useAllVisits(enabled = true) {
  return useQuery({
    queryKey: ["visits", "all"],
    enabled,
    queryFn: async (): Promise<SiteVisit[]> => {
      const { data } = await supabase
        .from("site_visits")
        .select(`${SELECT}, buyer:profiles!site_visits_buyer_id_fkey(id,full_name,mobile)`)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as SiteVisit[]) ?? [];
    },
  });
}

/** Combine a calendar day and a slot into an exact instant. */
export function slotDate(day: Date, slot: Pick<VisitSlot, "hour" | "minute">): Date {
  const d = new Date(day);
  d.setHours(slot.hour, slot.minute, 0, 0);
  return d;
}

export async function bookVisit(
  propertyId: string,
  scheduledAt: Date,
  slotLabel: string,
  notes?: string
): Promise<string> {
  const { data, error } = await supabase.rpc("book_site_visit", {
    p_property_id: propertyId,
    p_scheduled_at: scheduledAt.toISOString(),
    p_slot_label: slotLabel,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function rescheduleVisit(visitId: string, scheduledAt: Date, slotLabel: string): Promise<void> {
  const { error } = await supabase.rpc("reschedule_site_visit", {
    p_visit_id: visitId,
    p_scheduled_at: scheduledAt.toISOString(),
    p_slot_label: slotLabel,
  });
  if (error) throw error;
}

export async function cancelVisit(visitId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_site_visit", {
    p_visit_id: visitId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function setVisitStatus(visitId: string, status: Exclude<VisitStatus, "cancelled">): Promise<void> {
  const { error } = await supabase.rpc("set_site_visit_status", {
    p_visit_id: visitId,
    p_status: status,
  });
  if (error) throw error;
}

/** Refresh every visit list plus the notification badge after a mutation. */
export function useRefreshVisits() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["visits"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread-notifications"] });
  };
}

/** "Sat, 26 Jul · 10:00 AM" */
export function formatVisitWhen(v: Pick<SiteVisit, "scheduled_at" | "slot_label">): string {
  if (!v.scheduled_at) return v.slot_label ?? "Date to be confirmed";
  const d = new Date(v.scheduled_at);
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return v.slot_label ? `${day} · ${v.slot_label}` : day;
}

/** A visit can still be changed while it is upcoming and not closed out. */
export function isVisitOpen(v: SiteVisit): boolean {
  return v.status === "requested" || v.status === "confirmed";
}
