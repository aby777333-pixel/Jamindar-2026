// Promoter earnings — client helpers over the commission engine (migration
// 0017). All money is server-computed; the client only reads + formats.
import { supabase } from "./supabase";

export type Earnings = { total: number; pending: number; paid: number; count: number };

export type CommissionRow = {
  id: string;
  from_member: string | null;
  from_name: string | null;
  level: number;
  amount: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  created_at: string;
};

export async function fetchMyEarnings(): Promise<Earnings> {
  const { data, error } = await supabase.rpc("my_earnings");
  if (error) throw error;
  const d = (data ?? {}) as Partial<Record<keyof Earnings, number | string>>;
  return {
    total: Number(d.total ?? 0),
    pending: Number(d.pending ?? 0),
    paid: Number(d.paid ?? 0),
    count: Number(d.count ?? 0),
  };
}

export async function fetchMyCommissions(limit = 50): Promise<CommissionRow[]> {
  const { data, error } = await supabase.rpc("my_commissions", { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    from_member: r.from_member,
    from_name: r.from_name,
    level: Number(r.level),
    amount: Number(r.amount ?? 0),
    status: r.status,
    created_at: r.created_at,
  }));
}
