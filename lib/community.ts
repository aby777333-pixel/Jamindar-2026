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
}

export interface CommunityComment {
  id: string;
  body: string;
  masked: boolean;
  created_at: string;
  mine: boolean;
  author: CommunityAuthor;
}

export type CommunityPostDetail = CommunityPost & { comments_list: CommunityComment[]; status?: string };

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

export async function addCommunityComment(postId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("add_community_comment", { p_post: postId, p_body: body });
  if (error) throw error;
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
  const uid = await currentUid();
  const out: PickedCommunityMedia = { media: [], skipped: [] };
  let n = 0;
  for (const asset of res.assets) {
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
