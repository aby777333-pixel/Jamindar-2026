// Secure in-app messaging (migration 0022).
//
// Threads are membership-scoped in Postgres; every write goes through a
// SECURITY DEFINER RPC so notifications, the communication log and the audit
// spine are always written. The client never inserts into `messages` directly.
//
// The counterpart's profile is not readable under RLS, so the inbox comes from
// the `my_threads()` RPC rather than a client-side join.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
import { liveChannel } from "./realtime";

export type MessageKind = "text" | "image" | "file" | "property" | "system";

export interface ThreadSummary {
  thread_id: string;
  subject: string | null;
  property_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  is_locked: boolean;
  counterpart_id: string | null;
  counterpart_name: string | null;
  counterpart_avatar: string | null;
  counterpart_role: string | null;
  unread: number;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  property_id: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ThreadParticipant {
  thread_id: string;
  user_id: string;
  last_read_at: string | null;
}

/** Open (or reuse) a conversation. Routing rules are enforced server-side. */
export async function openThreadWith(
  counterpartId: string,
  opts: { propertyId?: string | null; visitId?: string | null } = {}
): Promise<string> {
  const { data, error } = await supabase.rpc("open_thread", {
    p_counterpart: counterpartId,
    p_property_id: opts.propertyId ?? null,
    p_visit_id: opts.visitId ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** The signed-in user's inbox, newest first, with unread counts. */
export function useThreads(enabled = true) {
  return useQuery({
    queryKey: ["threads"],
    enabled,
    queryFn: async (): Promise<ThreadSummary[]> => {
      const { data, error } = await supabase.rpc("my_threads");
      if (error) throw error;
      return (data as ThreadSummary[]) ?? [];
    },
  });
}

/** Total unread across every thread — drives the badge. */
export function useUnreadMessages(enabled = true) {
  return useQuery({
    queryKey: ["unread-messages"],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("my_unread_messages");
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

export function useThreadMessages(threadId?: string | null) {
  return useQuery({
    queryKey: ["messages", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data as Message[]) ?? [];
    },
  });
}

/** The other participant's last_read_at — that is the read receipt. */
export function useThreadParticipants(threadId?: string | null) {
  return useQuery({
    queryKey: ["thread-participants", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<ThreadParticipant[]> => {
      const { data } = await supabase
        .from("thread_participants")
        .select("thread_id,user_id,last_read_at")
        .eq("thread_id", threadId!);
      return (data as ThreadParticipant[]) ?? [];
    },
  });
}

/** Live delivery: refresh the open thread (and the inbox) on any new row. */
export function useRealtimeThread(threadId?: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!threadId) return;
    // unique topic — a fixed `thread:<id>` collides on remount / double mount
    const channel = supabase
      .channel(liveChannel(`thread-${threadId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", threadId] });
          qc.invalidateQueries({ queryKey: ["thread-participants", threadId] });
          qc.invalidateQueries({ queryKey: ["threads"] });
          qc.invalidateQueries({ queryKey: ["unread-messages"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc]);
}

/** Live inbox: any new message anywhere refreshes the list + badge. */
export function useRealtimeInbox(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    // Account and Messages both mount this hook, so the topic must be unique
    // per subscriber — a shared "inbox" topic collides and crashes the app.
    const channel = supabase
      .channel(liveChannel("inbox"))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["threads"] });
        qc.invalidateQueries({ queryKey: ["unread-messages"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

export async function sendMessage(
  threadId: string,
  opts: {
    body?: string;
    kind?: MessageKind;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
    propertyId?: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("send_message", {
    p_thread_id: threadId,
    p_body: opts.body ?? null,
    p_kind: opts.kind ?? "text",
    p_attachment_url: opts.attachmentUrl ?? null,
    p_attachment_name: opts.attachmentName ?? null,
    p_attachment_mime: opts.attachmentMime ?? null,
    p_property_id: opts.propertyId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function markThreadRead(threadId: string): Promise<void> {
  await supabase.rpc("mark_thread_read", { p_thread_id: threadId }).then(
    () => {},
    () => {}
  );
}

export async function moderateThread(threadId: string, locked: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_moderate_thread", { p_thread_id: threadId, p_locked: locked });
  if (error) throw error;
}

export async function removeMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_delete_message", { p_message_id: messageId });
  if (error) throw error;
}

function base64ToBytes(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 3) / 4);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (chars.indexOf(clean[i]) << 18) |
      (chars.indexOf(clean[i + 1]) << 12) |
      (chars.indexOf(clean[i + 2]) << 6) |
      chars.indexOf(clean[i + 3]);
    out[p++] = (n >> 16) & 0xff;
    out[p++] = (n >> 8) & 0xff;
    out[p++] = n & 0xff;
  }
  return out.slice(0, Math.floor((clean.length * 3) / 4));
}

/**
 * Pick an image and attach it to a thread.
 * Storage path is `chat/<thread_id>/<user_id>/<file>` — the bucket policy only
 * lets thread members read it, and only into their own folder.
 */
export async function pickAndSendImage(threadId: string, userId: string): Promise<boolean> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Please allow photo access.");
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, base64: true });
  if (res.canceled || !res.assets?.[0]?.base64) return false;

  const asset = res.assets[0];
  const base64 = asset.base64;
  if (!base64) return false;
  const mime = asset.mimeType || "image/jpeg";
  const ext = (mime.split("/")[1] || "jpg").split("+")[0];
  const name = asset.fileName || `photo_${Date.now()}.${ext}`;
  const path = `${threadId}/${userId}/${Date.now()}_${name.replace(/[^\w.\-]/g, "_")}`;

  const { error } = await supabase.storage
    .from("chat")
    .upload(path, base64ToBytes(base64), { contentType: mime, upsert: false });
  if (error) throw error;

  // private bucket → a signed URL the recipient can open
  const { data: signed } = await supabase.storage.from("chat").createSignedUrl(path, 60 * 60 * 24 * 365);
  await sendMessage(threadId, {
    kind: "image",
    attachmentUrl: signed?.signedUrl ?? path,
    attachmentName: name,
    attachmentMime: mime,
  });
  return true;
}

/** Share a property into a conversation. */
export async function shareProperty(threadId: string, propertyId: string, note?: string): Promise<void> {
  await sendMessage(threadId, { kind: "property", propertyId, body: note });
}

export function useRefreshMessaging() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["threads"] });
    qc.invalidateQueries({ queryKey: ["messages"] });
    qc.invalidateQueries({ queryKey: ["unread-messages"] });
    qc.invalidateQueries({ queryKey: ["thread-participants"] });
  };
}
