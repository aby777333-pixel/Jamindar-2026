import { create } from "zustand";
import { supabase } from "./supabase";
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from "./env";
import type { Profile } from "./types";

interface AuthState {
  loading: boolean;
  profile: Profile | null;
  userId: string | null;
  setProfile: (p: Profile | null) => void;
  refreshProfile: () => Promise<Profile | null>;
  bootstrap: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  loading: true,
  profile: null,
  userId: null,

  setProfile: (p) => set({ profile: p, userId: p?.id ?? get().userId }),

  refreshProfile: async () => {
    const { data: sessionData } = await supabase.auth.getUser();
    const uid = sessionData.user?.id;
    if (!uid) {
      set({ profile: null, userId: null });
      return null;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    set({ profile: (data as Profile) ?? null, userId: uid });
    return (data as Profile) ?? null;
  },

  bootstrap: async () => {
    set({ loading: true });
    try {
      await get().refreshProfile();
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ profile: null, userId: null });
  },
}));

// ---------- OTP helpers (call edge functions) ----------
async function fn<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}

export async function sendOtp(mobile: string) {
  return fn<{ sent: boolean; mobile: string; delivered: boolean; devCode?: string }>(
    "send-otp",
    { mobile }
  );
}

export async function verifyOtp(mobile: string, code: string) {
  const res = await fn<{
    verified: boolean;
    email: string;
    password: string;
    isNew: boolean;
    userId: string;
  }>("verify-otp", { mobile, code });
  // exchange returned creds for a real session
  const { error } = await supabase.auth.signInWithPassword({
    email: res.email,
    password: res.password,
  });
  if (error) throw new Error(error.message);
  return res;
}
