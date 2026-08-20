import { supabase } from "./supabase";

/**
 * Self-service account deletion — the flow the published policy and Google
 * Play both require (the policy's "Delete Account" section describes exactly
 * this, and until now the app had no way to do it).
 *
 * FILES FIRST, THEN THE DATABASE, AND THE ORDER IS THE POINT. The user's own
 * RLS grants (kyc_obj_owner_rw, avatars_owner) let them delete their own
 * storage folders through the Storage API — which is the deletion that
 * actually removes bytes from object storage. The RPC's own storage delete is
 * only a metadata fallback for a client that died between the two steps, so
 * doing the API removal first is what makes "permanently removed from
 * storage" literally true. Both folders are listed and removed in full, which
 * also catches files orphaned by abandoned upload retries — the columns on
 * kyc_submissions only remember the LAST upload of each document.
 */
async function purgeOwnFolder(bucket: "kyc" | "avatars", uid: string): Promise<number> {
  const { data: files, error } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
  if (error || !files?.length) return 0;
  const paths = files.map((f) => `${uid}/${f.name}`);
  const { error: delErr } = await supabase.storage.from(bucket).remove(paths);
  return delErr ? 0 : paths.length;
}

export type DeleteAccountResult = {
  ok: boolean;
  kyc_purged: boolean;
  kyc_files_deleted: number;
  saved_plots_deleted: number;
  site_visits_deleted: number;
  messages_deleted: number;
  financial_records: string;
};

/**
 * Deletes the signed-in user's account. The confirmation phrase is typed by
 * the user and validated server-side — passing anything but "DELETE" is
 * refused, and the RPC acts only on auth.uid(), so it cannot be aimed at
 * anyone else no matter what a tampered client sends.
 *
 * ⚠️ FILES ARE SWEPT BEFORE THE RPC, AND THE SERVER IS ASKED FIRST. The
 * retention decision is the server's: a user with a confirmed booking keeps
 * their KYC files for the statutory 8 years, and a buyer cannot read their
 * own bookings to decide locally — so `kyc_must_be_retained()` answers that
 * one question up front. The sweep must come BEFORE `delete_my_account`,
 * because the RPC's fallback removes the object METADATA, after which the
 * Storage API can no longer list the files to remove their bytes. The avatar
 * has no retention branch — the bucket is public and the photo must go in
 * every case. If the app dies between the sweep and the RPC, nothing is
 * lost: the account is untouched and the user simply taps Delete again.
 */
export async function deleteMyAccount(confirmPhrase: string): Promise<DeleteAccountResult> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session?.session?.user?.id;
  if (!uid) throw new Error("You are not signed in.");

  // The RPC validates the phrase authoritatively, but files are swept before
  // the RPC runs — so refuse a bad phrase here rather than sweep and then fail.
  if (confirmPhrase !== "DELETE") throw new Error("Please type DELETE to confirm.");

  const { data: keep, error: keepErr } = await supabase.rpc("kyc_must_be_retained");
  if (keepErr) throw new Error(keepErr.message);

  if (!keep) await purgeOwnFolder("kyc", uid).catch(() => {});
  await purgeOwnFolder("avatars", uid).catch(() => {});

  const { data, error } = await supabase.rpc("delete_my_account", { p_confirm: confirmPhrase });
  if (error) throw new Error(error.message);
  return data as DeleteAccountResult;
}
