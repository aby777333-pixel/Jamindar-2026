/**
 * Project documents and the "on request" workflow (admin spec §4, §8).
 *
 * A project's documents live in `project_documents` and their files in the
 * PRIVATE `project-docs` bucket. Whether a member may open a file is decided by
 * Postgres, not by this file:
 *
 *   · a document with `on_request = false` is readable by any signed-in member;
 *   · a document with `on_request = true` is readable only by a member who has
 *     an approved row in `document_requests`.
 *
 * Both rules are storage policies, so a signed URL simply cannot be minted for a
 * file the member is not entitled to — guessing a path gains nothing, and
 * nothing here has to be trusted to enforce it. That is why this module is
 * allowed to be as simple as it is.
 */
import { supabase } from "@/lib/supabase";

export type DocType =
  | "approval_plan" | "legal_opinion" | "approval_copy" | "sale_agreement" | "other";

export type RequestStatus = "pending" | "approved" | "rejected" | "downloaded";

export type ProjectDocument = {
  id: string;
  property_id: string;
  doc_type: DocType;
  name: string;
  file_url: string;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  version: number;
  on_request: boolean;
  uploaded_at: string;
};

export type DocumentRequest = {
  id: string;
  document_id: string | null;
  status: RequestStatus;
  review_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
};

export const DOC_LABEL: Record<DocType, string> = {
  approval_plan: "Approval plan",
  legal_opinion: "Legal opinion",
  approval_copy: "Approval copy",
  sale_agreement: "Sale agreement (model)",
  other: "Document",
};

/** Active, publicly listed documents for one project, newest version first. */
export async function fetchProjectDocuments(propertyId: string): Promise<ProjectDocument[]> {
  const { data } = await supabase
    .from("project_documents")
    .select("id,property_id,doc_type,name,file_url,storage_path,file_size,mime_type,version,on_request,uploaded_at")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("doc_type")
    .order("version", { ascending: false });
  // Only the current version of each type is offered; the older ones are kept
  // for the audit trail, not for members to download.
  const seen = new Set<string>();
  return ((data as ProjectDocument[]) ?? []).filter((d) => {
    if (seen.has(d.doc_type)) return false;
    seen.add(d.doc_type);
    return true;
  });
}

/** This member's requests, newest first, keyed by document. */
export async function fetchMyDocumentRequests(userId: string): Promise<Record<string, DocumentRequest>> {
  const { data } = await supabase
    .from("document_requests")
    .select("id,document_id,status,review_reason,requested_at,reviewed_at")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });
  const byDoc: Record<string, DocumentRequest> = {};
  for (const r of (data as DocumentRequest[]) ?? []) {
    if (r.document_id && !byDoc[r.document_id]) byDoc[r.document_id] = r;
  }
  return byDoc;
}

/**
 * Ask for a gated document.
 *
 * A partial unique index allows only one PENDING request per member per
 * document, so a double tap cannot queue the desk twice — the second insert
 * comes back as a duplicate and is reported as "already requested" rather than
 * as a failure. Asking again after a rejection is allowed, which is the point
 * of making the index partial.
 */
export async function requestDocument(
  userId: string,
  doc: ProjectDocument,
  note?: string,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.from("document_requests").insert({
    user_id: userId,
    property_id: doc.property_id,
    document_id: doc.id,
    doc_name: doc.name,
    note: note?.trim() || null,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505")
      return { ok: true, message: "You have already asked for this document. We will let you know." };
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Requested. You will be notified once it is approved." };
}

/**
 * A five-minute signed URL for a document the member is entitled to.
 *
 * If they are not entitled, storage refuses and this returns null — the calling
 * screen shows "Request document" instead. No entitlement check is duplicated
 * here, because a second copy of a rule is a second chance to get it wrong.
 */
export async function documentUrl(doc: ProjectDocument): Promise<string | null> {
  const path = doc.storage_path || doc.file_url;
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;      // legacy rows that hold a URL
  const { data, error } = await supabase.storage.from("project-docs").createSignedUrl(path, 300);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Record that an approved document was actually taken (spec §8 "Downloaded"). */
export async function markDownloaded(requestId: string): Promise<void> {
  await supabase
    .from("document_requests")
    .update({ status: "downloaded", downloaded_at: new Date().toISOString() })
    .eq("id", requestId);
}
