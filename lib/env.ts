import Constants from "expo-constants";

type Extra = { supabaseUrl?: string; supabaseAnonKey?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const SUPABASE_URL =
  extra.supabaseUrl ?? "https://zmxqozvivdluuxvvcegs.supabase.co";
export const SUPABASE_ANON_KEY =
  extra.supabaseAnonKey ?? "sb_publishable_7Oe-H5Ekn7FaS9c0pVbrVQ_ph9LHHsS";

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
