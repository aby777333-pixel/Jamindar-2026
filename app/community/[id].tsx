import { useMemo, useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Share } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { Card, Loading, Empty } from "@/components/ui";
import { useAuth } from "@/lib/store";
import { communityShareMessage } from "@/lib/referral";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { CommunityPostCard } from "./index";
import {
  fetchCommunityPost, addCommunityComment, editCommunityComment, deleteCommunityComment,
  pinCommunityComment, unpinCommunityComment, askCommunityAdmin,
  buildCommunityThreads, type CommunityComment, type CommunityPostDetail,
} from "@/lib/community";

/**
 * One community post: its videos, the threaded comments, and the composer.
 *
 * Replies are attached to the comment they answer (spec §2) — the thread is
 * rebuilt client-side from parent_id, because the RPC keeps returning a flat
 * list so the build already on people's phones does not break.
 */
export default function CommunityPostScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [editing, setEditing] = useState<CommunityComment | null>(null);
  const [menuFor, setMenuFor] = useState<CommunityComment | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  const { data: post, isLoading, refetch } = useQuery({
    queryKey: ["community-post", id],
    enabled: !!id,
    queryFn: () => fetchCommunityPost(String(id)),
  });

  const threads = useMemo(
    () => buildCommunityThreads(post?.comments_list ?? [], post?.pinned_comment_id),
    [post?.comments_list, post?.pinned_comment_id],
  );

  function refresh() {
    refetch();
    qc.invalidateQueries({ queryKey: ["community-feed"] });
  }

  async function onSend() {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (editing) {
        await editCommunityComment(editing.id, body);
      } else {
        await addCommunityComment(String(id), body, replyTo?.id ?? null);
      }
      setComment("");
      setReplyTo(null);
      setEditing(null);
      refresh();
    } catch (e: any) {
      Alert.alert(editing ? "Couldn't save the change" : "Couldn't comment", e?.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  }

  function onEdit(c: CommunityComment) {
    setMenuFor(null);
    setEditing(c);
    setReplyTo(null);
    setComment(c.body);
  }

  function onDelete(c: CommunityComment) {
    setMenuFor(null);
    // Wording taken from the spec.
    Alert.alert("Delete comment", "Are you sure you want to delete this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCommunityComment(c.id);
            if (editing?.id === c.id) { setEditing(null); setComment(""); }
            if (replyTo?.id === c.id) setReplyTo(null);
            refresh();
          } catch (e: any) {
            Alert.alert("Couldn't delete", e?.message ?? "Please try again.");
          }
        },
      },
    ]);
  }

  async function onPin(c: CommunityComment, pinned: boolean) {
    setMenuFor(null);
    try {
      if (pinned) await unpinCommunityComment(String(id));
      else await pinCommunityComment(String(id), c.id);
      refresh();
    } catch (e: any) {
      Alert.alert("Couldn't change the pin", e?.message ?? "Please try again.");
    }
  }

  const videos = post?.media?.filter((m) => m.type === "video") ?? [];
  const liveCount = (post?.comments_list ?? []).filter((c) => !c.deleted).length;

  // §9 — the referral code comes off the live profile at share time, exactly as
  // the property share does, so attribution follows whoever actually shared it.
  async function onSharePost() {
    if (!id) return;
    const ref = profile?.referral_code ?? profile?.partner_code ?? profile?.member_code ?? null;
    try {
      await Share.share({ message: communityShareMessage(post?.body, id, ref) });
    } catch {
      Alert.alert("Could not share", "Please try again.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Post</Text>
        {/* §9 — share the post as a public /c/ link anyone can open without the
            app. The sharer's referral code rides along so the visitor, lead and
            any enquiry are attributed back to them. */}
        {post ? (
          <Pressable onPress={onSharePost} hitSlop={8} accessibilityLabel="Share this post">
            <Ionicons name="share-social-outline" size={22} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <Loading />
      ) : !post ? (
        <Empty title="Post unavailable" subtitle="It may have been removed." />
      ) : (
        // Bug 28-07 (report 7): the composer slid behind the open keyboard —
        // with edge-to-edge Android the window no longer resizes itself, so
        // the screen must pad for the keyboard explicitly.
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 20, gap: space.sm }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <CommunityPostCard post={post} onChanged={refresh} />

            {/* videos play here (the feed shows a tap-to-watch tile) */}
            {videos.map((v) => (
              <CommunityVideo key={v.url} uri={v.url} />
            ))}

            {/* §4 — ask the Jamin team about this particular post */}
            <Pressable
              onPress={() => setAskOpen(true)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12 }}
            >
              <Ionicons name="help-buoy-outline" size={17} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 13.5 }}>Ask Admin about this post</Text>
            </Pressable>

            <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 15, marginTop: 4 }}>
              Comments {liveCount ? `(${liveCount})` : ""}
            </Text>

            {post.comments_locked ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="lock-closed" size={13} color={colors.inkFaint} />
                <Text style={{ color: colors.inkFaint, fontSize: 12.5 }}>Comments are closed on this post.</Text>
              </View>
            ) : null}

            {threads.length === 0 ? (
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>No comments yet — say something nice.</Text>
            ) : (
              threads.map((t) => (
                <View key={t.comment.id} style={{ gap: 6 }}>
                  <CommentRow
                    c={t.comment}
                    post={post}
                    pinned={post.pinned_comment_id === t.comment.id}
                    onReply={() => { setEditing(null); setReplyTo(t.comment); }}
                    onMenu={() => setMenuFor(t.comment)}
                  />
                  {t.replies.length ? (
                    <View style={{ marginLeft: 18, gap: 6, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 10 }}>
                      {t.replies.map((r) => (
                        <CommentRow
                          key={r.id}
                          c={r}
                          post={post}
                          pinned={post.pinned_comment_id === r.id}
                          onReply={() => { setEditing(null); setReplyTo(r); }}
                          onMenu={() => setMenuFor(r)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>

          {/* comment composer — the privacy note lives on its own line so the
              placeholder is never truncated (bug 28-07, report 7) */}
          <View style={{ paddingHorizontal: space.md, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) + 6, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }}>
            {replyTo || editing ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, backgroundColor: colors.surfaceSunken, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Ionicons name={editing ? "create-outline" : "return-down-forward"} size={13} color={colors.brand} />
                <Text style={{ flex: 1, color: colors.inkSoft, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                  {editing ? "Editing your comment" : `Replying to ${replyTo?.author.name}`}
                </Text>
                <Pressable onPress={() => { setReplyTo(null); setEditing(null); setComment(""); }} hitSlop={8}>
                  <Ionicons name="close" size={15} color={colors.inkFaint} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <Ionicons name="shield-checkmark" size={11} color={colors.success} />
                <Text style={{ color: colors.inkFaint, fontSize: 11 }}>Phone numbers & emails are hidden automatically.</Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={editing ? "Update your comment…" : replyTo ? `Reply to ${replyTo.author.name}…` : "Write a comment…"}
              placeholderTextColor={colors.inkFaint}
              style={{ flex: 1, backgroundColor: colors.surfaceSunken, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, color: colors.ink, fontSize: 14 }}
              returnKeyType="send"
              onSubmitEditing={onSend}
            />
            <Pressable onPress={onSend} disabled={sending || !comment.trim()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: comment.trim() ? colors.brand : colors.border, alignItems: "center", justifyContent: "center" }}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name={editing ? "checkmark" : "send"} size={17} color="#fff" />}
            </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <CommentMenu
        comment={menuFor}
        canPin={!!post?.can_pin}
        isPinned={!!menuFor && post?.pinned_comment_id === menuFor.id}
        onClose={() => setMenuFor(null)}
        onEdit={onEdit}
        onDelete={onDelete}
        onPin={onPin}
      />

      <AskAdminSheet
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        onSubmit={async (q) => { await askCommunityAdmin(String(id), q); }}
      />
    </SafeAreaView>
  );
}

/** One comment. Own comments (and any comment, for an admin) get the ⋯ menu. */
function CommentRow({
  c, post, pinned, onReply, onMenu,
}: {
  c: CommunityComment;
  post: CommunityPostDetail;
  pinned: boolean;
  onReply: () => void;
  onMenu: () => void;
}) {
  if (c.deleted) {
    return (
      <Card style={{ paddingVertical: 10 }}>
        <Text style={{ color: colors.inkFaint, fontSize: 13, fontStyle: "italic" }}>This comment was deleted.</Text>
      </Card>
    );
  }
  const showMenu = !!c.can_manage || !!post.can_pin;
  return (
    <Card style={{ gap: 4, paddingVertical: 12, borderWidth: pinned ? 1 : 0, borderColor: pinned ? colors.brand : "transparent" }}>
      {pinned ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 }}>
          <Ionicons name="pin" size={12} color={colors.brand} />
          <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "800" }}>Pinned Reply</Text>
          {post.pinned_by ? (
            <Text style={{ color: colors.inkFaint, fontSize: 11 }}>· pinned by {post.pinned_by}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 13 }} numberOfLines={1}>{c.author.name}</Text>
        {c.is_admin_reply ? (
          <View style={{ backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>ADMIN</Text>
          </View>
        ) : null}
        <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{timeAgo(c.created_at)}</Text>
        {c.edited ? <Text style={{ color: colors.inkFaint, fontSize: 11 }}>· Edited</Text> : null}
        {c.masked ? <Ionicons name="shield-checkmark" size={12} color={colors.success} /> : null}
        <View style={{ flex: 1 }} />
        {showMenu ? (
          <Pressable onPress={onMenu} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={17} color={colors.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      {c.reply_to_name ? (
        <Text style={{ color: colors.inkFaint, fontSize: 11.5 }}>Replying to {c.reply_to_name}</Text>
      ) : null}

      <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>{c.body}</Text>

      {!post.comments_locked ? (
        <Pressable onPress={onReply} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 2 }}>
          <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 12 }}>Reply</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** The ⋯ action menu: Edit / Delete / Pin / Cancel (spec §1 & §3). */
function CommentMenu({
  comment, canPin, isPinned, onClose, onEdit, onDelete, onPin,
}: {
  comment: CommunityComment | null;
  canPin: boolean;
  isPinned: boolean;
  onClose: () => void;
  onEdit: (c: CommunityComment) => void;
  onDelete: (c: CommunityComment) => void;
  onPin: (c: CommunityComment, pinned: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!comment) return null;
  const Row = ({ icon, label, danger, onPress }: { icon: any; label: string; danger?: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, paddingHorizontal: 4 }}>
      <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.ink} />
      <Text style={{ fontSize: 15, fontWeight: "600", color: danger ? colors.danger : colors.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 + insets.bottom }}>
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6 }} />
          {comment.can_manage ? <Row icon="create-outline" label="Edit comment" onPress={() => onEdit(comment)} /> : null}
          {canPin ? (
            <Row icon={isPinned ? "remove-circle-outline" : "pin-outline"}
                 label={isPinned ? "Unpin this reply" : "Pin this reply"}
                 onPress={() => onPin(comment, isPinned)} />
          ) : null}
          {comment.can_manage ? <Row icon="trash-outline" label="Delete comment" danger onPress={() => onDelete(comment)} /> : null}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          <Row icon="close" label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** §4 — a question to the Jamin team about this post. */
function AskAdminSheet({
  visible, onClose, onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setDone(true);
      setQ("");
    } catch (e: any) {
      Alert.alert("Couldn't send", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDone(false);
    setQ("");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <Pressable style={{ flex: 1 }} onPress={close} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 18 + insets.bottom, gap: 10 }}>
            <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 3, backgroundColor: colors.border }} />
            {done ? (
              <View style={{ gap: 10, alignItems: "center", paddingVertical: 8 }}>
                <Ionicons name="checkmark-circle" size={42} color={colors.success} />
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>Question sent</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 13, textAlign: "center" }}>
                  The Jamin team has it. Their answer appears under this post, and you'll get a notification.
                </Text>
                <Pressable onPress={close} style={{ marginTop: 4, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 26 }}>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.ink }}>Ask Admin</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 12.5 }}>
                  Your question goes to the Jamin team with this post attached. Your phone number and email
                  stay private — they are never shown in the community.
                </Text>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="What would you like to know?"
                  placeholderTextColor={colors.inkFaint}
                  multiline
                  style={{ minHeight: 92, textAlignVertical: "top", backgroundColor: colors.surfaceSunken, borderRadius: 12, padding: 12, color: colors.ink, fontSize: 14 }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={close} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, alignItems: "center" }}>
                    <Text style={{ fontWeight: "700", color: colors.ink }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={submit} disabled={busy || !q.trim()} style={{ flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: q.trim() ? colors.brand : colors.border }}>
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontWeight: "800", color: "#fff" }}>Send question</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CommunityVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <VideoView player={player} style={{ width: "100%", height: 230, borderRadius: 14, backgroundColor: "#000" }} contentFit="contain" nativeControls />
  );
}
