// Jamin Community — client helpers (migration 0044).
//
// Posting ALWAYS goes through the create_community_post / add_community_comment
// RPCs: the server masks emails & phone numbers in the text before the post
// exists publicly and records the originals for the admin. The client never
// writes community_posts/community_comments directly (no grant).
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { base64ToBytes, readUriBytes, assetSize } from "./submissions";
import { loadMemory } from "./jamindar";
import { useAuth } from "./store";

/** The reader's preferred Jamindar language (the chip/settings choice) —
 *  drives the per-post Translate button. Cached once per session. */
export function usePreferredLanguage(): string {
  const { profile } = useAuth();
  const uid = profile?.id;
  const { data } = useQuery({
    queryKey: ["jamindar-lang", uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => (await loadMemory(uid!))?.language ?? "en-IN",
  });
  return data ?? "en-IN";
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type CommunityMediaType = "image" | "video" | "pdf" | "audio" | "file";
export interface CommunityMedia {
  type: CommunityMediaType;
  url: string;
  name?: string;
}

export interface CommunityAuthor {
  name: string;
  member_code: string | null;
  avatar_url: string | null;
  role?: string | null;
}

export interface CommunityPost {
  id: string;
  body: string;
  media: CommunityMedia[];
  links: string[];
  masked: boolean;
  created_at: string;
  author: CommunityAuthor;
  likes: number;
  comments: number;
  liked: boolean;
  mine: boolean;
  /** True once the author (or an admin) has edited it — drives "Edited". */
  edited?: boolean;
}

export interface CommunityComment {
  id: string;
  body: string;
  masked: boolean;
  created_at: string;
  mine: boolean;
  author: CommunityAuthor;
  // ── threading & moderation (migration 0068) ──
  /** null for a top-level comment; otherwise the comment being replied to. */
  parent_id?: string | null;
  /** who this reply is answering — drives the "Replying to Arun" line. */
  reply_to_name?: string | null;
  edited?: boolean;
  edited_at?: string | null;
  /** soft-deleted, kept only as an anchor for replies underneath it. */
  deleted?: boolean;
  is_admin_reply?: boolean;
  /** true for your own comments, and for admins on anyone's. */
  can_manage?: boolean;
}

export type CommunityPostDetail = CommunityPost & {
  comments_list: CommunityComment[];
  status?: string;
  comments_locked?: boolean;
  pinned_comment_id?: string | null;
  pinned_by?: string | null;
  can_pin?: boolean;
  is_admin?: boolean;
};

/** A comment plus the replies hanging off it. */
export interface CommunityThread {
  comment: CommunityComment;
  replies: CommunityComment[];
}

/**
 * Turn the flat comment array into threads.
 *
 * The RPC deliberately returns a flat list so older builds keep rendering it;
 * the shape is rebuilt here. Replies nested more than one level deep are
 * lifted to their top-level ancestor so a long chain still reads as one
 * conversation rather than marching off the right edge of a phone.
 */
export function buildCommunityThreads(
  comments: CommunityComment[],
  pinnedId?: string | null,
): CommunityThread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: CommunityComment): string => {
    const seen = new Set<string>();
    let cur = c;
    while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent_id)!;
    }
    return cur.id;
  };

  const threads = new Map<string, CommunityThread>();
  for (const c of comments) {
    if (!c.parent_id || !byId.has(c.parent_id)) threads.set(c.id, { comment: c, replies: [] });
  }
  for (const c of comments) {
    if (!c.parent_id || !byId.has(c.parent_id)) continue;
    threads.get(rootOf(c))?.replies.push(c);
  }

  // A deleted comment with no surviving replies is not worth a tombstone.
  const list = [...threads.values()].filter((t) => !t.comment.deleted || t.replies.length > 0);
  if (!pinnedId) return list;
  const i = list.findIndex((t) => t.comment.id === pinnedId || t.replies.some((r) => r.id === pinnedId));
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
}

export async function fetchCommunityFeed(before?: string): Promise<CommunityPost[]> {
  const { data, error } = await supabase.rpc("community_feed", {
    p_limit: 30,
    p_before: before ?? null,
  });
  if (error) throw error;
  return (data as CommunityPost[]) ?? [];
}

export async function fetchCommunityPost(id: string): Promise<CommunityPostDetail | null> {
  const { data, error } = await supabase.rpc("community_post_detail", { p_id: id });
  if (error) throw error;
  return (data as CommunityPostDetail) ?? null;
}

/** URLs typed into the body become tappable link chips. */
export function extractLinks(body: string): string[] {
  const m = body.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  return [...new Set(m)].slice(0, 6);
}

export async function createCommunityPost(input: { body: string; media: CommunityMedia[] }): Promise<string> {
  const { data, error } = await supabase.rpc("create_community_post", {
    p_body: input.body,
    p_media: input.media,
    p_links: extractLinks(input.body),
  });
  if (error) throw error;
  return data as string;
}

/** Post a comment, or a reply when `parentId` is given (§2 — it stays on this post). */
export async function addCommunityComment(postId: string, body: string, parentId?: string | null): Promise<void> {
  const { error } = await supabase.rpc("add_community_comment", {
    p_post: postId,
    p_body: body,
    p_parent: parentId ?? null,
  });
  if (error) throw error;
}

/** Update a comment in place — never creates a second one (§1). */
export async function editCommunityComment(commentId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("edit_community_comment", { p_id: commentId, p_body: body });
  if (error) throw error;
}

export async function deleteCommunityComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_community_comment", { p_id: commentId });
  if (error) throw error;
}

/** Pin one reply beneath a post — post owner or admin only (§3). */
export async function pinCommunityComment(postId: string, commentId: string): Promise<void> {
  const { error } = await supabase.rpc("pin_community_comment", { p_post: postId, p_comment: commentId });
  if (error) throw error;
}

export async function unpinCommunityComment(postId: string): Promise<void> {
  const { error } = await supabase.rpc("unpin_community_comment", { p_post: postId });
  if (error) throw error;
}

/** Ask the Jamin admin about this specific post (§4). */
export async function askCommunityAdmin(postId: string, question: string): Promise<string> {
  const { data, error } = await supabase.rpc("ask_community_admin", { p_post: postId, p_question: question });
  if (error) throw error;
  return data as string;
}

export async function toggleCommunityLike(postId: string, liked: boolean): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  if (liked) {
    await supabase.from("community_likes").delete().eq("post_id", postId).eq("user_id", uid);
  } else {
    await supabase.from("community_likes").insert({ post_id: postId, user_id: uid });
  }
}

export async function removeCommunityPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_community_post", { p_id: postId });
  if (error) throw error;
}

/**
 * Update a post in place, keeping its likes and replies (0072). Own posts
 * only; admins may moderate anyone's.
 *
 * Pass `media` to also detach attachments (0075). It must be the list that
 * should REMAIN — the server rejects anything that was not already on the
 * post, so an edit can never add media through this path. Leave it undefined
 * and the attachments are untouched, which keeps the call identical to the one
 * every shipped build makes.
 */
export async function editCommunityPost(
  postId: string,
  body: string,
  media?: CommunityMedia[],
): Promise<void> {
  const { error } = await supabase.rpc(
    "edit_community_post",
    media === undefined
      ? { p_id: postId, p_body: body }
      : { p_id: postId, p_body: body, p_media: media },
  );
  if (error) throw error;
}

export async function reportCommunityPost(postId: string, reason: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  await supabase.from("community_reports").insert({ post_id: postId, reporter_id: uid, reason });
}

// ── uploads (public 'community' bucket, own folder) ────────────────────────
async function currentUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Not signed in.");
  return uid;
}

async function uploadToCommunity(uid: string, tag: string, bytes: Uint8Array, mime: string, ext: string): Promise<string> {
  const path = `${uid}/${Date.now()}_${tag}.${ext}`;
  const { error } = await supabase.storage.from("community").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  return supabase.storage.from("community").getPublicUrl(path).data.publicUrl;
}

export interface PickedCommunityMedia {
  media: CommunityMedia[];
  skipped: string[];
}

/** Pick photos & videos from the phone and upload them. */
/** Longest clip the camera will record, in seconds (owner: two minutes). */
export const COMMUNITY_VIDEO_MAX_SECONDS = 120;

/** Shared upload path for assets, however they were obtained. Gallery picks and
 *  camera captures must behave identically — size limit, mime handling and
 *  naming all live here so the two can never drift apart. */
async function uploadPickedAssets(assets: ImagePicker.ImagePickerAsset[]): Promise<PickedCommunityMedia> {
  const uid = await currentUid();
  const out: PickedCommunityMedia = { media: [], skipped: [] };
  let n = 0;
  for (const asset of assets) {
    const isVideo = asset.type === "video";
    const size = await assetSize(asset.uri, asset.fileSize);
    if (size && size > MAX_UPLOAD_BYTES) {
      out.skipped.push(asset.fileName || (isVideo ? "video" : "photo"));
      continue;
    }
    const mime = asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
    const ext = (mime.split("/")[1] || (isVideo ? "mp4" : "jpg")).split("+")[0];
    const bytes = !isVideo && asset.base64 ? base64ToBytes(asset.base64) : await readUriBytes(asset.uri);
    const url = await uploadToCommunity(uid, String(n++), bytes, mime, ext);
    out.media.push({ type: isVideo ? "video" : "image", url, name: asset.fileName ?? undefined });
  }
  return out;
}

export async function pickCommunityMedia(): Promise<PickedCommunityMedia> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Please allow photo & video access.");
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    quality: 0.75,
    base64: true,
    selectionLimit: 8,
  });
  if (res.canceled) return { media: [], skipped: [] };
  return uploadPickedAssets(res.assets);
}

/** Take a photo or record a clip right now, instead of picking one that already
 *  exists. Clips are capped at COMMUNITY_VIDEO_MAX_SECONDS. */
export async function captureCommunityMedia(kind: "photo" | "video"): Promise<PickedCommunityMedia> {
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  if (!cam.granted) throw new Error("Please allow camera access to take a photo or video.");

  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: kind === "video" ? ["videos"] : ["images"],
    quality: 0.75,
    // Only stills come back as base64 — a two-minute clip encoded that way
    // would be enormous and is read from its uri instead.
    base64: kind === "photo",
    videoMaxDuration: COMMUNITY_VIDEO_MAX_SECONDS,
  });
  if (res.canceled) return { media: [], skipped: [] };
  return uploadPickedAssets(res.assets);
}

/** Pick documents (PDF & any other format) and upload them. */
export async function pickCommunityDocuments(): Promise<PickedCommunityMedia> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return { media: [], skipped: [] };
  const uid = await currentUid();
  const out: PickedCommunityMedia = { media: [], skipped: [] };
  let n = 0;
  for (const asset of res.assets) {
    const size = await assetSize(asset.uri, asset.size);
    if (size && size > MAX_UPLOAD_BYTES) {
      out.skipped.push(asset.name || "document");
      continue;
    }
    const mime = asset.mimeType || "application/octet-stream";
    const name = (asset.name || "file").replace(/[^\w.\-]+/g, "_");
    const ext = name.includes(".") ? name.split(".").pop()! : (mime.split("/")[1] || "bin").split("+")[0];
    const bytes = await readUriBytes(asset.uri);
    const url = await uploadToCommunity(uid, `doc_${n++}_${name.replace(/\.[^.]*$/, "")}`, bytes, mime, ext);
    out.media.push({ type: mime === "application/pdf" ? "pdf" : "file", url, name: asset.name ?? undefined });
  }
  return out;
}

/** Upload a recorded voice note (m4a from expo-audio). */
export async function uploadVoiceNote(uri: string): Promise<CommunityMedia> {
  const uid = await currentUid();
  const bytes = await readUriBytes(uri);
  const url = await uploadToCommunity(uid, "voice", bytes, "audio/mp4", "m4a");
  return { type: "audio", url, name: "Voice note" };
}
