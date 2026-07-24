// Promoter Earning Tree — client helpers over the recursive RPCs (migration
// 0016). Levels are endless; sale/earn are 0 until the commission engine ships.
import { supabase } from "./supabase";

export type TreeLevel = { level: number; users: number };

export type TreeUser = {
  user_id: string;
  member_code: string | null;
  full_name: string | null;
  joined: string;
  direct_referrals: number;
  sale: number;
  earn: number;
};

/** Level-wise headcount for the signed-in promoter's downline. */
export async function fetchMyTree(): Promise<TreeLevel[]> {
  const { data, error } = await supabase.rpc("my_promoter_tree");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ level: Number(r.level), users: Number(r.users) }));
}

/** Members at a specific level of the signed-in promoter's downline. */
export async function fetchMyTreeLevel(level: number): Promise<TreeUser[]> {
  const { data, error } = await supabase.rpc("my_promoter_tree_level", { p_level: level });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    user_id: r.user_id,
    member_code: r.member_code,
    full_name: r.full_name,
    joined: r.joined,
    direct_referrals: Number(r.direct_referrals),
    sale: Number(r.sale ?? 0),
    earn: Number(r.earn ?? 0),
  }));
}
