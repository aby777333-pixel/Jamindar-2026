/* ════════════════════════════════════════════════════════════════════════════
   LAYOUT MAPPER — the admin console's visual plot-mapping editor (2026-09-17)

   Owner's brief: one original layout image per project, every plot made
   individually interactive by a separate aligned overlay, managed here once and
   shown identically on the website and in the app. Reusable for any project —
   nothing in this file knows about a particular layout.

   Workflow: upload layout → draw / auto-trace plot polygons → assign plot
   numbers (link or create records) → edit plot information → draw roads and
   open spaces → calibrate scale → preview at desktop / tablet / mobile widths →
   validate → publish with explicit approval. Drafts save at any time; published
   versions are immutable (the database enforces it) and every earlier version
   can be restored as a new draft.

   DATA (migration 0097):
     layout_versions / layout_shapes  — the source of truth, super-admin RLS
     admin_layout_save / _validate / _publish / _unpublish / _fork / _archive
     admin_plot_upsert                — edits one plot_layout record in place
     properties.plan_image            — the published snapshot both apps read

   ⚠️ COORDINATES ARE NORMALISED 0..1 of the image's width and height. That is
   what keeps a polygon aligned when the page serves a smaller rendition, and
   what lets a re-exported image of the same drawing reuse the polygons.

   Loaded lazily by admin.html (`import("./layout-mapper.js")`), so the rest of
   the console never pays for it.
   ════════════════════════════════════════════════════════════════════════════ */

const WEBSITE = "https://jaminbazaar.in";
const STATUSES = [
  ["available", "Available"],
  ["reserved", "Reserved"],
  ["booked", "Booked"],
  ["sold", "Sold"],
  ["blocked", "Blocked"],
  ["not_released", "Not released"],
];
const DEFAULT_TINT = {
  available: { color: "#1f8a5b", opacity: 0.1 },
  reserved: { color: "#c9962c", opacity: 0.3 },
  booked: { color: "#c8102e", opacity: 0.3 },
  sold: { color: "#6e0303", opacity: 0.36 },
  blocked: { color: "#8a8f98", opacity: 0.4 },
  not_released: { color: "#5b6b7a", opacity: 0.34 },
};
const KINDS = [
  ["plot", "Plot"],
  ["road", "Road"],
  ["open_space", "Open space / park"],
  ["reserved", "Reserved / utility"],
  ["boundary", "Site boundary"],
];
const KIND_COLOR = { plot: "#2563eb", road: "#e07a2e", open_space: "#2f9e44", reserved: "#7c3aed", boundary: "#e11b22" };

let CTX = null; // { sb, toast, esc, alog, modal, closeModal }
const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

/* ───────────────────────── styles (scoped, injected once) ───────────────────────── */
function injectCss() {
  if (document.getElementById("lm-css")) return;
  const s = document.createElement("style");
  s.id = "lm-css";
  s.textContent = `
  .lm-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .lm-grow{flex:1}
  .lm-card{padding:16px;margin-bottom:14px}
  .lm-tbl{width:100%;border-collapse:collapse;font-size:13px}
  .lm-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint);padding:8px;border-bottom:1px solid var(--hair)}
  .lm-tbl td{padding:9px 8px;border-bottom:1px solid var(--hair);vertical-align:middle}
  .lm-ed{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;height:calc(100vh - 150px);min-height:560px}
  .lm-canvas-wrap{display:flex;flex-direction:column;min-width:0}
  .lm-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;border:1px solid var(--hair);border-radius:12px 12px 0 0;background:var(--surface)}
  .lm-tool{background:var(--sunken);color:var(--ink-soft);border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600}
  .lm-tool.on{background:var(--navy);color:#fff}
  .lm-tool:disabled{opacity:.4;cursor:not-allowed}
  .lm-sep{width:1px;height:22px;background:var(--hair);margin:0 2px}
  .lm-box{position:relative;flex:1;overflow:hidden;border:1px solid var(--hair);border-top:none;border-radius:0 0 12px 12px;background:repeating-conic-gradient(var(--sunken) 0 25%,var(--surface) 0 50%) 0 0/22px 22px;touch-action:none;user-select:none}
  .lm-stage{position:absolute;left:0;top:0;transform-origin:0 0}
  .lm-stage img{display:block;width:100%;height:100%;pointer-events:none;max-width:none}
  .lm-stage svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .lm-side{display:flex;flex-direction:column;min-height:0;border:1px solid var(--hair);border-radius:12px;background:var(--surface)}
  .lm-tabs{display:flex;border-bottom:1px solid var(--hair)}
  .lm-tabs button{flex:1;background:none;padding:10px 4px;font-size:12.5px;font-weight:600;color:var(--ink-faint);border-bottom:2px solid transparent}
  .lm-tabs button.on{color:var(--ink);border-bottom-color:var(--brand)}
  .lm-pane{padding:12px 14px;overflow:auto;flex:1;font-size:13px}
  .lm-pane label{margin:10px 0 4px}
  .lm-list{display:flex;flex-direction:column;gap:4px}
  .lm-item{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;background:var(--canvas);cursor:pointer;font-size:12.5px}
  .lm-item:hover{background:var(--sunken)}
  .lm-item.sel{outline:2px solid var(--brand)}
  .lm-dot{width:9px;height:9px;border-radius:50%;flex:none}
  .lm-hint{font-size:12px;color:var(--ink-faint);line-height:1.45}
  .lm-err{color:var(--brand);font-size:12.5px;margin:3px 0}
  .lm-warn{color:var(--gold-dark);font-size:12.5px;margin:3px 0}
  .lm-status{position:absolute;left:10px;bottom:10px;background:rgba(20,26,46,.82);color:#fff;font-size:11.5px;padding:5px 9px;border-radius:8px;pointer-events:none}
  .lm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .lm-pv{display:flex;flex-direction:column;align-items:center;gap:10px}
  .lm-device{border:10px solid #1b1f2d;border-radius:22px;overflow:hidden;background:#fff;position:relative}
  .lm-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px}
  .lm-kv b{font-weight:600;color:var(--ink-soft)}
  @media (max-width:1100px){.lm-ed{grid-template-columns:1fr;height:auto}.lm-box{height:70vh;flex:none}.lm-side{max-height:none}}
  `;
  document.head.appendChild(s);
}

/* ───────────────────────── entry ───────────────────────── */
export async function mount(root, ctx) {
  CTX = ctx;
  injectCss();
  await renderHome(root);
}

async function loadProperties() {
  const { data, error } = await CTX.sb
    .from("properties")
    .select("id,title,slug,status,plot_layout,plan_image,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function renderHome(root, pickId) {
  root.innerHTML = `<div class="skel" style="height:420px"></div>`;
  let props;
  try {
    props = await loadProperties();
  } catch (e) {
    root.innerHTML = `<div class="card lm-card"><b>Could not load projects.</b><div class="lm-err">${esc(e.message)}</div></div>`;
    return;
  }
  const sel = pickId || sessionStorage.getItem("lm-prop") || props[0]?.id;
  root.innerHTML = `
    <div class="card lm-card">
      <div class="lm-row">
        <div class="lm-grow" style="min-width:260px">
          <label style="margin-top:0">Project</label>
          <select id="lm-prop">${props
            .map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.title)} · ${esc(p.status)}${p.plan_image ? " · interactive plan live" : ""}</option>`)
            .join("")}</select>
        </div>
        <div>
          <label style="margin-top:0">&nbsp;</label>
          <label class="btn" style="margin:0;display:inline-block;color:#fff">⬆ Upload new layout
            <input id="lm-upload" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label>
        </div>
      </div>
      <p class="lm-hint" style="margin:10px 0 0">Upload the original approved layout (JPG, PNG, WebP or PDF). The file is stored exactly as uploaded;
      the website and app are served a colour-safe web rendition of it. Plot polygons are drawn over the image and never alter it.
      Publishing, unpublishing and archiving the <i>project itself</i> stays in <b>Properties</b> (Status).</p>
    </div>
    <div id="lm-versions"></div>`;
  const pick = root.querySelector("#lm-prop");
  const draw = () => {
    sessionStorage.setItem("lm-prop", pick.value);
    renderVersions(root.querySelector("#lm-versions"), props.find((p) => p.id === pick.value), root);
  };
  pick.onchange = draw;
  root.querySelector("#lm-upload").onchange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) startUpload(root, props.find((p) => p.id === pick.value), f);
  };
  if (props.length) draw();
}

async function renderVersions(el, prop, root) {
  if (!prop) return;
  el.innerHTML = `<div class="skel" style="height:220px"></div>`;
  const { data: vers, error } = await CTX.sb
    .from("layout_versions")
    .select("id,version_no,state,label,image_url,image_w,image_h,created_at,published_at,note,based_on,layout_shapes(count)")
    .eq("property_id", prop.id)
    .order("version_no", { ascending: false });
  if (error) {
    el.innerHTML = `<div class="card lm-card"><div class="lm-err">${esc(error.message)}</div></div>`;
    return;
  }
  const live = prop.plan_image;
  const records = Array.isArray(prop.plot_layout) ? prop.plot_layout.length : 0;
  const pill = (s) => ({ draft: "warn", published: "ok", superseded: "grey", archived: "grey" }[s] || "grey");
  const showArchived = el.dataset.archived === "1";
  const list = (vers || []).filter((v) => showArchived || v.state !== "archived");
  el.innerHTML = `
    <div class="card lm-card">
      <div class="lm-row" style="justify-content:space-between">
        <div><b style="font-size:15px">${esc(prop.title)}</b>
          <div class="lm-hint">${records} plot records · ${live ? `interactive plan <b>v${live.version_no}</b> live since ${fmt(live.published_at)}` : "no interactive layout published"}</div></div>
        <div class="lm-row">
          ${prop.slug ? `<a class="btn grey sm" target="_blank" rel="noopener" href="${WEBSITE}/property/${esc(prop.slug)}#layout">View on website ↗</a>` : ""}
          ${live ? `<button class="btn ghost sm" id="lm-unpub">Unpublish layout</button>` : ""}
          <label class="lm-hint" style="display:flex;gap:6px;align-items:center;margin:0"><input type="checkbox" id="lm-arch" style="width:auto" ${showArchived ? "checked" : ""}> show archived</label>
        </div>
      </div>
      <table class="lm-tbl" style="margin-top:12px">
        <thead><tr><th>Version</th><th>State</th><th>Label</th><th>Shapes</th><th>Image</th><th>Created</th><th>Published</th><th></th></tr></thead>
        <tbody>${
          list.length
            ? list
                .map(
                  (v) => `<tr>
          <td><b>v${v.version_no}</b>${v.based_on ? `<div class="lm-hint">from v${(vers.find((x) => x.id === v.based_on) || {}).version_no ?? "?"}</div>` : ""}</td>
          <td><span class="pill ${pill(v.state)}">${v.state}</span></td>
          <td>${esc(v.label || "")}${v.note ? `<div class="lm-hint">${esc(v.note).slice(0, 140)}</div>` : ""}</td>
          <td>${v.layout_shapes?.[0]?.count ?? 0}</td>
          <td><a href="${esc(v.image_url)}" target="_blank" rel="noopener">${v.image_w}×${v.image_h}</a></td>
          <td>${fmt(v.created_at)}</td><td>${fmt(v.published_at)}</td>
          <td style="white-space:nowrap">
            <button class="btn ${v.state === "draft" ? "" : "grey"} sm" data-open="${v.id}">${v.state === "draft" ? "Edit" : "View"}</button>
            ${v.state === "published" ? `<button class="btn gold sm" data-fork="${v.id}">New revision</button>` : ""}
            ${v.state === "superseded" || v.state === "archived" ? `<button class="btn grey sm" data-fork="${v.id}" data-restore="1">Restore as draft</button>` : ""}
            ${v.state === "draft" ? `<button class="btn grey sm" data-archive="${v.id}">Archive</button>` : ""}
          </td></tr>`,
                )
                .join("")
            : `<tr><td colspan="8" class="muted" style="padding:18px">No layout uploaded for this project yet. Use <b>Upload new layout</b> above.</td></tr>`
        }</tbody>
      </table>
      <p class="lm-hint" style="margin-top:10px">Published versions are locked. To change an approved layout, create a <b>New revision</b> (a draft copy), edit it and publish it — the previous version stays on record and can be restored.</p>
    </div>`;
  el.querySelector("#lm-arch").onchange = (e) => {
    el.dataset.archived = e.target.checked ? "1" : "";
    renderVersions(el, prop, root);
  };
  el.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openEditor(root, prop.id, b.dataset.open)));
  el.querySelectorAll("[data-fork]").forEach(
    (b) =>
      (b.onclick = async () => {
        const restore = b.dataset.restore === "1";
        const label = prompt(restore ? "Label for the restored draft" : "Label for the new revision", restore ? "Restored version" : "Revision");
        if (label === null) return;
        const { data, error } = await CTX.sb.rpc("admin_layout_fork", { p_version: b.dataset.fork, p_label: label });
        if (error) return CTX.toast(error.message);
        CTX.toast("Draft created");
        openEditor(root, prop.id, data);
      }),
  );
  el.querySelectorAll("[data-archive]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Archive this draft? It stays on record and can be restored later.")) return;
        const { error } = await CTX.sb.rpc("admin_layout_archive", { p_version: b.dataset.archive });
        if (error) return CTX.toast(error.message);
        renderVersions(el, prop, root);
      }),
  );
  const un = el.querySelector("#lm-unpub");
  if (un)
    un.onclick = async () => {
      if (!confirm("Withdraw the interactive layout from the website and app? The page falls back to its previous plan views. The version stays on record.")) return;
      const { error } = await CTX.sb.rpc("admin_layout_unpublish", { p_property: prop.id });
      if (error) return CTX.toast(error.message);
      await revalidateWebsite(prop);
      CTX.toast("Layout unpublished");
      renderHome(root, prop.id);
    };
}

/* ───────────────────────── upload ───────────────────────── */
async function fileToCanvasSource(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (!window.pdfjsLib) {
      const m = await import("./vendor/pdfjs/pdf.min.mjs");
      m.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
      window.pdfjsLib = m;
    }
    const pdf = await window.pdfjsLib.getDocument({
      data: await file.arrayBuffer(),
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/standard_fonts/",
    }).promise;
    if (pdf.numPages > 1) CTX.toast(`PDF has ${pdf.numPages} pages — using page 1`);
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(6, 8000 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    return { source: c, w: c.width, h: c.height };
  }
  const bmp = await createImageBitmap(file);
  return { source: bmp, w: bmp.width, h: bmp.height };
}

async function rendition(src, sw, sh, maxW, quality) {
  const scale = Math.min(1, maxW / sw, 16000 / sh);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; // transparent PNGs render on paper, as printed
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  let blob = await new Promise((r) => c.toBlob(r, "image/webp", quality));
  let ext = "webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    ext = "jpg";
  }
  return { blob, ext, w, h };
}

async function startUpload(root, prop, file) {
  if (!prop) return;
  const { data: vers } = await CTX.sb
    .from("layout_versions")
    .select("id,version_no,state")
    .eq("property_id", prop.id)
    .in("state", ["published", "draft", "superseded"])
    .order("version_no", { ascending: false });
  const body = `
    <p class="lm-hint">File: <b>${esc(file.name)}</b> (${(file.size / 1048576).toFixed(1)} MB)</p>
    <label>Version label</label><input id="up-label" value="${esc(file.name.replace(/\.[^.]+$/, ""))}">
    <label>Polygons</label>
    <select id="up-copy"><option value="">Start with no polygons</option>${(vers || [])
      .map((v) => `<option value="${v.id}">Copy polygons from v${v.version_no} (${v.state}) — only if this is the same drawing re-exported</option>`)
      .join("")}</select>
    <p class="lm-hint">Copied polygons are positioned by proportion, so they only line up if the new image has the same framing. Check every one before publishing.</p>
    <div id="up-prog" class="lm-hint" style="margin-top:10px"></div>
    <div class="lm-row" style="justify-content:flex-end;margin-top:14px"><button class="btn grey" onclick="closeModal()">Cancel</button><button class="btn" id="up-go">Upload and open editor</button></div>`;
  CTX.modal("Upload new layout", body);
  document.getElementById("up-go").onclick = async (ev) => {
    const btn = ev.currentTarget;
    const prog = document.getElementById("up-prog");
    const say = (m) => (prog.textContent = m);
    btn.disabled = true;
    try {
      const { data: u } = await CTX.sb.auth.getUser();
      if (!u?.user) throw new Error("Your session has expired. Reload and sign in again.");
      say("Reading the file…");
      const { source, w, h } = await fileToCanvasSource(file);
      if (w < 200 || h < 200) throw new Error("That image is too small to map plots on.");
      say(`Preparing web renditions of ${w}×${h}…`);
      const disp = await rendition(source, w, h, 1600, 0.86);
      const hi = w > 1600 ? await rendition(source, w, h, 12000, 0.82) : null;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const dir = `${prop.id}/layouts/${stamp}`;
      const put = async (path, blob, type) => {
        const { error } = await CTX.sb.storage.from("property-media").upload(path, blob, { upsert: false, contentType: type, cacheControl: "31536000" });
        if (error) throw error;
        return CTX.sb.storage.from("property-media").getPublicUrl(path).data.publicUrl;
      };
      say("Uploading the original, untouched…");
      const sourceUrl = await put(`${dir}/original-${safe}`, file, file.type || "application/octet-stream");
      say("Uploading the display rendition…");
      const imageUrl = await put(`${dir}/display.${disp.ext}`, disp.blob, disp.blob.type);
      let hiUrl = null;
      if (hi) {
        say("Uploading the full-resolution rendition…");
        hiUrl = await put(`${dir}/hi.${hi.ext}`, hi.blob, hi.blob.type);
      }
      // The overlay coordinate space is the full-resolution image's.
      const W = hi ? hi.w : disp.w;
      const H = hi ? hi.h : disp.h;
      let shapes = [];
      let meta0 = {};
      const copyFrom = document.getElementById("up-copy").value;
      if (copyFrom) {
        const { data: cs } = await CTX.sb.from("layout_shapes").select("kind,plot_no,plot_uid,label,points,sort").eq("version_id", copyFrom).order("sort");
        shapes = cs || [];
        const { data: cv } = await CTX.sb.from("layout_versions").select("style,review").eq("id", copyFrom).single();
        meta0 = { style: cv?.style || {}, review: cv?.review || [] };
      }
      say("Creating the draft…");
      const { data: vid, error } = await CTX.sb.rpc("admin_layout_save", {
        p_version: null,
        p_property: prop.id,
        p_meta: {
          ...meta0,
          label: document.getElementById("up-label").value,
          source_name: file.name,
          source_url: sourceUrl,
          image_url: imageUrl,
          image_hi_url: hiUrl,
          image_w: W,
          image_h: H,
          based_on: copyFrom || null,
        },
        p_shapes: shapes,
      });
      if (error) throw error;
      CTX.closeModal();
      CTX.toast("Layout uploaded");
      openEditor(root, prop.id, vid);
    } catch (e) {
      btn.disabled = false;
      say("");
      prog.innerHTML = `<div class="lm-err">${esc(e.message || e)}</div>`;
    }
  };
}

/* ───────────────────────── revalidation ───────────────────────── */
async function revalidateWebsite(prop) {
  try {
    const { data } = await CTX.sb.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch(`${WEBSITE}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: prop.slug || null, id: prop.id }),
    });
  } catch (e) {
    /* The site still refreshes on its own schedule; never fail the save. */
  }
}

/* ───────────────────────── geometry helpers ───────────────────────── */
const polyArea = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(a / 2);
};
const pointIn = (x, y, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
function polyProblem(p) {
  if (!Array.isArray(p) || p.length < 3) return "fewer than 3 points";
  for (const q of p) if (!(q[0] >= -0.001 && q[0] <= 1.001 && q[1] >= -0.001 && q[1] <= 1.001)) return "point outside the image";
  if (polyArea(p) < 1e-7) return "zero area";
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [cx, cy] = p[j], [dx, dy] = p[(j + 1) % n];
      const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
      const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
      const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return "edges cross";
    }
  }
  return null;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  let idx = 0, dmax = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i][0], pts[i][1], ax, ay, bx, by);
    if (d > dmax) (dmax = d), (idx = i);
  }
  if (dmax > eps) return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
  return [pts[0], pts[pts.length - 1]];
}

/* Auto-trace: flood-fill the light region under the click, close small gaps
   over printed text, trace its outer edge and simplify. An ASSIST — the result
   is always shown for the administrator to check and adjust. */
function autoTrace(an, sx, sy) {
  const { data, w, h } = an;
  const x0 = Math.round(sx), y0 = Math.round(sy);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return null;
  const at = (x, y) => (y * w + x) * 4;
  const i0 = at(x0, y0);
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const sr = data[i0], sg = data[i0 + 1], sb = data[i0 + 2];
  if (lum(i0) < 90) return { error: "Click inside a plot, not on a line or a label." };
  const tol = 46;
  const same = (i) => Math.abs(data[i] - sr) <= tol && Math.abs(data[i + 1] - sg) <= tol && Math.abs(data[i + 2] - sb) <= tol;
  const mask = new Uint8Array(w * h);
  const stack = [x0, y0];
  let count = 0;
  const cap = w * h * 0.12;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    let lx = x;
    while (lx >= 0 && !mask[y * w + lx] && same(at(lx, y))) lx--;
    lx++;
    let rx = x;
    while (rx < w && !mask[y * w + rx] && same(at(rx, y))) rx++;
    for (let i = lx; i < rx; i++) {
      mask[y * w + i] = 1;
      count++;
    }
    if (count > cap) return { error: "That region leaks into the surroundings (a gap in its outline). Draw this one by hand." };
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let i = lx;
      while (i < rx) {
        if (!mask[ny * w + i] && same(at(i, ny))) {
          stack.push(i, ny);
          while (i < rx && !mask[ny * w + i] && same(at(i, ny))) i++;
        }
        i++;
      }
    }
  }
  if (count < 30) return { error: "Region too small." };
  // bbox
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  // grow by 2px so the edge sits on the boundary line's centre
  const R = 2;
  const bw = maxX - minX + 1 + 2 * R + 2, bh = maxY - minY + 1 + 2 * R + 2;
  const ox = minX - R - 1, oy = minY - R - 1;
  const m2 = new Uint8Array(bw * bh);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++)
      if (mask[y * w + x])
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) m2[(y - oy + dy) * bw + (x - ox + dx)] = 1;
  // Moore-neighbour trace of the outer contour
  let sxp = -1, syp = -1;
  outer: for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (m2[y * bw + x]) { sxp = x; syp = y; break outer; }
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && m2[y * bw + x];
  const contour = [];
  let cx = sxp, cy = syp, dir = 6, guard = 0;
  do {
    contour.push([cx, cy]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (inside(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break;
  } while ((cx !== sxp || cy !== syp) && ++guard < 400000);
  if (contour.length < 8) return { error: "Could not trace that region." };
  const peri = contour.length;
  let simp = simplify(contour.concat([contour[0]]), Math.max(1.5, peri * 0.006)).slice(0, -1);
  if (simp.length > 14) simp = simplify(contour.concat([contour[0]]), Math.max(2, peri * 0.012)).slice(0, -1);
  return { pts: simp.map(([x, y]) => [(x + ox) / w, (y + oy) / h]) };
}

/* ───────────────────────── editor ───────────────────────── */
async function openEditor(root, propertyId, versionId) {
  root.innerHTML = `<div class="skel" style="height:70vh"></div>`;
  const sb = CTX.sb;
  const [{ data: v, error: e1 }, { data: shapesRows, error: e2 }, { data: prop, error: e3 }] = await Promise.all([
    sb.from("layout_versions").select("*").eq("id", versionId).single(),
    sb.from("layout_shapes").select("*").eq("version_id", versionId).order("sort"),
    sb.from("properties").select("id,title,slug,plot_layout,plot_plan,plan_image").eq("id", propertyId).single(),
  ]);
  if (e1 || e2 || e3) {
    root.innerHTML = `<div class="card lm-card"><div class="lm-err">${esc((e1 || e2 || e3).message)}</div><button class="btn grey sm" id="lm-back">← Back</button></div>`;
    root.querySelector("#lm-back").onclick = () => renderHome(root, propertyId);
    return;
  }
  const S = {
    root,
    v,
    prop,
    readOnly: v.state !== "draft",
    W: v.image_w,
    H: v.image_h,
    shapes: (shapesRows || []).map((r) => ({ id: uid(), kind: r.kind, plot_no: r.plot_no || "", plot_uid: r.plot_uid || "", label: r.label || "", points: r.points })),
    meta: {
      label: v.label || "",
      metres_per_px: v.metres_per_px,
      scale_note: v.scale_note || "",
      style: v.style || {},
      review: Array.isArray(v.review) ? v.review : [],
      note: v.note || "",
    },
    records: Array.isArray(prop.plot_layout) ? prop.plot_layout : [],
    tool: "select",
    sel: null, // shape id
    selVertex: -1,
    draft: null, // points being drawn
    calib: null,
    tx: null,
    dirty: false,
    undo: [],
    redo: [],
    tab: "shape",
    validation: null,
    analysis: null,
    showNumbers: true,
  };
  window.__lm = S; // handy for support from the console
  renderEditor(S);
}

function snapshot(S) {
  S.undo.push(JSON.stringify(S.shapes));
  if (S.undo.length > 60) S.undo.shift();
  S.redo = [];
}
function markDirty(S) {
  S.dirty = true;
  const d = S.root.querySelector("#lm-dirty");
  if (d) d.style.display = "inline-flex";
}
const recordFor = (S, no) => S.records.find((r) => String(r.plot ?? r.plot_no ?? "").trim().toLowerCase() === String(no || "").trim().toLowerCase());

function renderEditor(S) {
  const { v, prop } = S;
  S.root.innerHTML = `
    <div class="card lm-card" style="padding:10px 14px">
      <div class="lm-row">
        <button class="btn grey sm" id="lm-back">← Versions</button>
        <b>${esc(prop.title)}</b>
        <span class="pill ${S.readOnly ? "grey" : "warn"}">v${v.version_no} · ${v.state}</span>
        <input id="lm-label" value="${esc(S.meta.label)}" placeholder="Version label" style="max-width:260px;padding:6px 10px" ${S.readOnly ? "disabled" : ""}>
        <span class="pill red" id="lm-dirty" style="display:none">unsaved</span>
        <span class="lm-grow"></span>
        ${
          S.readOnly
            ? `<button class="btn gold sm" id="lm-fork">${v.state === "published" ? "New revision to edit" : "Restore as draft"}</button>`
            : `<label class="btn grey sm" style="margin:0">Replace image<input id="lm-replace" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label>
               <button class="btn grey sm" id="lm-save">Save draft</button>`
        }
        <button class="btn grey sm" id="lm-validate">Validate</button>
        <button class="btn grey sm" id="lm-preview">Preview</button>
        ${S.readOnly ? "" : `<button class="btn green sm" id="lm-publish">Publish…</button>`}
      </div>
    </div>
    <div class="lm-ed">
      <div class="lm-canvas-wrap">
        <div class="lm-tools">
          ${[
            ["select", "↖ Select / move", "V"],
            ["draw", "✎ Draw polygon", "P"],
            ["trace", "✨ Auto-trace", "A"],
            ["calib", "📏 Set scale", "S"],
          ]
            .map(([t, l, k]) => `<button class="lm-tool ${S.tool === t ? "on" : ""}" data-tool="${t}" title="${l} (${k})" ${S.readOnly && t !== "select" ? "disabled" : ""}>${l}</button>`)
            .join("")}
          <span class="lm-sep"></span>
          <button class="lm-tool" id="lm-zout" title="Zoom out">−</button>
          <button class="lm-tool" id="lm-zin" title="Zoom in">+</button>
          <button class="lm-tool" id="lm-fit" title="Fit whole layout">Fit</button>
          <span class="lm-sep"></span>
          <button class="lm-tool" id="lm-undo" title="Undo (Ctrl+Z)" ${S.readOnly ? "disabled" : ""}>↶</button>
          <button class="lm-tool" id="lm-redo" title="Redo (Ctrl+Y)" ${S.readOnly ? "disabled" : ""}>↷</button>
          <span class="lm-sep"></span>
          <label class="lm-hint" style="display:flex;gap:5px;align-items:center;margin:0"><input type="checkbox" id="lm-nums" style="width:auto" ${S.showNumbers ? "checked" : ""}> labels</label>
        </div>
        <div class="lm-box" id="lm-box" tabindex="0">
          <div class="lm-stage" id="lm-stage" style="width:${S.W}px;height:${S.H}px">
            <img id="lm-img" crossorigin="anonymous" alt="">
            <svg id="lm-svg" viewBox="0 0 ${S.W} ${S.H}"></svg>
          </div>
          <div class="lm-status" id="lm-status"></div>
        </div>
      </div>
      <div class="lm-side">
        <div class="lm-tabs">${[
          ["shape", "Shape"],
          ["plots", "Plots"],
          ["review", "Review"],
          ["style", "Style & scale"],
        ]
          .map(([t, l]) => `<button data-tab="${t}" class="${S.tab === t ? "on" : ""}">${l}</button>`)
          .join("")}</div>
        <div class="lm-pane" id="lm-pane"></div>
      </div>
    </div>`;

  const $ = (q) => S.root.querySelector(q);
  $("#lm-back").onclick = () => {
    if (S.dirty && !confirm("Leave without saving this draft?")) return;
    renderHome(S.root, prop.id);
  };
  const lab = $("#lm-label");
  if (lab) lab.oninput = () => ((S.meta.label = lab.value), markDirty(S));
  S.root.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => setTool(S, b.dataset.tool)));
  S.root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => ((S.tab = b.dataset.tab), S.root.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)), renderPane(S))));
  $("#lm-zin").onclick = () => zoomBy(S, 1.4);
  $("#lm-zout").onclick = () => zoomBy(S, 1 / 1.4);
  $("#lm-fit").onclick = () => fit(S);
  $("#lm-nums").onchange = (e) => ((S.showNumbers = e.target.checked), drawSvg(S));
  if (!S.readOnly) {
    $("#lm-undo").onclick = () => undo(S);
    $("#lm-redo").onclick = () => redo(S);
    $("#lm-save").onclick = () => saveDraft(S);
    $("#lm-publish").onclick = () => publishFlow(S);
    $("#lm-replace").onchange = (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) replaceImage(S, f);
    };
  } else {
    $("#lm-fork").onclick = async () => {
      const { data, error } = await CTX.sb.rpc("admin_layout_fork", { p_version: v.id, p_label: v.state === "published" ? "Revision" : "Restored version" });
      if (error) return CTX.toast(error.message);
      openEditor(S.root, prop.id, data);
    };
  }
  $("#lm-validate").onclick = () => validate(S, true);
  $("#lm-preview").onclick = () => preview(S);

  const img = $("#lm-img");
  img.onload = () => {
    fit(S);
    buildAnalysis(S, img);
  };
  img.onerror = () => CTX.toast("The layout image could not be loaded");
  img.src = v.image_hi_url || v.image_url;
  bindCanvas(S);
  window.onbeforeunload = () => (S.dirty ? "unsaved" : undefined);
  renderPane(S);
  drawSvg(S);
}

function setTool(S, t) {
  if (S.readOnly && t !== "select") return;
  S.tool = t;
  S.draft = null;
  S.calib = null;
  S.root.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
  const tips = {
    select: "Click a shape to select · drag a corner to move it · drag inside to move the shape · double-click an edge to add a corner · Delete removes the selected corner or shape · drag empty space to pan",
    draw: "Click to place corners · click the first corner, double-click or press Enter to close · Backspace removes the last corner · Esc cancels",
    trace: "Click inside a plot to trace its outline automatically. Always check the result against the image.",
    calib: "Click two points whose real distance you know (e.g. the ends of a labelled plot side), then enter that distance in metres.",
  };
  status(S, tips[t]);
  drawSvg(S);
}
function status(S, m) {
  const el = S.root.querySelector("#lm-status");
  if (el) el.textContent = m || "";
}

/* view transform */
function applyTx(S) {
  const st = S.root.querySelector("#lm-stage");
  if (st && S.tx) st.style.transform = `translate(${S.tx.x}px,${S.tx.y}px) scale(${S.tx.s})`;
  drawSvg(S);
}
function fit(S) {
  const box = S.root.querySelector("#lm-box");
  if (!box) return;
  const s = Math.min(box.clientWidth / S.W, box.clientHeight / S.H) * 0.98;
  S.tx = { s, x: (box.clientWidth - S.W * s) / 2, y: (box.clientHeight - S.H * s) / 2 };
  applyTx(S);
}
function zoomAt(S, f, cx, cy) {
  const box = S.root.querySelector("#lm-box");
  const min = Math.min(box.clientWidth / S.W, box.clientHeight / S.H) * 0.5;
  const s = Math.max(min, Math.min(8, S.tx.s * f));
  const k = s / S.tx.s;
  S.tx = { s, x: cx - (cx - S.tx.x) * k, y: cy - (cy - S.tx.y) * k };
  applyTx(S);
}
function zoomBy(S, f) {
  const box = S.root.querySelector("#lm-box");
  zoomAt(S, f, box.clientWidth / 2, box.clientHeight / 2);
}
const toImg = (S, e) => {
  const r = S.root.querySelector("#lm-box").getBoundingClientRect();
  return [(e.clientX - r.left - S.tx.x) / S.tx.s / S.W, (e.clientY - r.top - S.tx.y) / S.tx.s / S.H];
};

function buildAnalysis(S, img) {
  try {
    const scale = Math.min(1, 2400 / img.naturalWidth, 6400 / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    S.analysis = { data: g.getImageData(0, 0, w, h).data, w, h };
  } catch (e) {
    S.analysis = null; // cross-origin or memory — auto-trace simply unavailable
  }
}

function bindCanvas(S) {
  const box = S.root.querySelector("#lm-box");
  let drag = null;
  let spaceDown = false;
  const hitShape = (nx, ny) => {
    let best = null;
    for (const sh of S.shapes) {
      if (pointIn(nx, ny, sh.points) && (!best || polyArea(sh.points) < polyArea(best.points))) best = sh;
    }
    return best;
  };
  const handleR = () => 7 / S.tx.s; // screen px → image px
  box.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      zoomAt(S, Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0022), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  box.addEventListener("pointerdown", (e) => {
    if (!S.tx) return;
    box.focus();
    const [nx, ny] = toImg(S, e);
    const px = nx * S.W, py = ny * S.H;
    const pan = e.button === 1 || spaceDown;
    if (pan) {
      drag = { type: "pan", sx: e.clientX, sy: e.clientY, tx: { ...S.tx } };
      box.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (S.tool === "draw" && !S.readOnly) {
      if (!S.draft) S.draft = [];
      const first = S.draft[0];
      if (first && S.draft.length >= 3 && Math.hypot((first[0] - nx) * S.W, (first[1] - ny) * S.H) < handleR() * 1.6) return finishDraft(S);
      S.draft.push([nx, ny]);
      drawSvg(S);
      return;
    }
    if (S.tool === "calib" && !S.readOnly) {
      S.calib = S.calib && S.calib.length === 1 ? [...S.calib, [nx, ny]] : [[nx, ny]];
      drawSvg(S);
      if (S.calib.length === 2) finishCalib(S);
      return;
    }
    if (S.tool === "trace" && !S.readOnly) {
      if (!S.analysis) return CTX.toast("Auto-trace is unavailable for this image — draw the polygon instead.");
      const r = autoTrace(S.analysis, nx * S.analysis.w, ny * S.analysis.h);
      if (!r || r.error) return CTX.toast(r?.error || "Nothing traced");
      if (polyProblem(r.pts)) return CTX.toast("The traced outline was not a clean polygon — draw this one by hand.");
      snapshot(S);
      const sh = { id: uid(), kind: "plot", plot_no: suggestNumber(S), plot_uid: "", label: "", points: r.pts };
      S.shapes.push(sh);
      S.sel = sh.id;
      markDirty(S);
      S.tab = "shape";
      syncTabs(S);
      renderPane(S);
      drawSvg(S);
      return;
    }
    // select tool
    const cur = S.shapes.find((x) => x.id === S.sel);
    if (cur && !S.readOnly) {
      const vi = cur.points.findIndex(([x, y]) => Math.hypot(x * S.W - px, y * S.H - py) < handleR());
      if (vi >= 0) {
        snapshot(S);
        S.selVertex = vi;
        drag = { type: "vertex", shape: cur, vi, moved: false };
        box.setPointerCapture(e.pointerId);
        return;
      }
    }
    const hit = hitShape(nx, ny);
    if (hit) {
      if (S.sel !== hit.id) {
        S.sel = hit.id;
        S.selVertex = -1;
        S.tab = "shape";
        syncTabs(S);
        renderPane(S);
      }
      drag = S.readOnly ? { type: "pan", sx: e.clientX, sy: e.clientY, tx: { ...S.tx } } : { type: "move", shape: hit, start: [nx, ny], orig: hit.points.map((p) => [...p]), moved: false, sx: e.clientX, sy: e.clientY };
      box.setPointerCapture(e.pointerId);
      drawSvg(S);
      return;
    }
    if (S.sel) {
      S.sel = null;
      S.selVertex = -1;
      renderPane(S);
      drawSvg(S);
    }
    drag = { type: "pan", sx: e.clientX, sy: e.clientY, tx: { ...S.tx } };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener("pointermove", (e) => {
    if (!S.tx) return;
    const [nx, ny] = toImg(S, e);
    if (S.tool === "draw" && S.draft) {
      S.cursor = [nx, ny];
      drawSvg(S);
    }
    if (S.tool === "calib" && S.calib?.length === 1) {
      S.cursor = [nx, ny];
      drawSvg(S);
    }
    if (!drag) return;
    if (drag.type === "pan") {
      S.tx = { ...drag.tx, x: drag.tx.x + e.clientX - drag.sx, y: drag.tx.y + e.clientY - drag.sy };
      applyTx(S);
    } else if (drag.type === "vertex") {
      drag.shape.points[drag.vi] = [Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny))];
      drag.moved = true;
      markDirty(S);
      drawSvg(S);
    } else if (drag.type === "move") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      if (!drag.moved) snapshot(S);
      drag.moved = true;
      const dx = nx - drag.start[0], dy = ny - drag.start[1];
      drag.shape.points = drag.orig.map(([x, y]) => [x + dx, y + dy]);
      markDirty(S);
      drawSvg(S);
    }
  });
  const end = () => {
    if (drag && drag.type === "vertex" && !drag.moved) S.undo.pop();
    if (drag && (drag.type === "vertex" || drag.type === "move") && drag.moved) renderPane(S);
    drag = null;
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
  box.addEventListener("dblclick", (e) => {
    if (S.readOnly || !S.tx) return;
    if (S.tool === "draw" && S.draft && S.draft.length >= 3) return finishDraft(S);
    if (S.tool !== "select") return;
    const cur = S.shapes.find((x) => x.id === S.sel);
    if (!cur) return;
    const [nx, ny] = toImg(S, e);
    let best = -1, bd = Infinity;
    cur.points.forEach((p, i) => {
      const q = cur.points[(i + 1) % cur.points.length];
      const d = segDist(nx * S.W, ny * S.H, p[0] * S.W, p[1] * S.H, q[0] * S.W, q[1] * S.H);
      if (d < bd) (bd = d), (best = i);
    });
    if (best >= 0 && bd < handleR() * 2) {
      snapshot(S);
      cur.points.splice(best + 1, 0, [nx, ny]);
      S.selVertex = best + 1;
      markDirty(S);
      drawSvg(S);
      renderPane(S);
    }
  });
  box.addEventListener("keydown", (e) => {
    if (e.target.closest("input,select,textarea")) return;
    const k = e.key;
    if (k === " ") {
      spaceDown = true;
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") return e.preventDefault(), e.shiftKey ? redo(S) : undo(S);
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "y") return e.preventDefault(), redo(S);
    if (k === "Escape") {
      S.draft = null;
      S.calib = null;
      drawSvg(S);
    }
    if (k === "Enter" && S.draft) finishDraft(S);
    if (k === "Backspace" && S.draft) {
      e.preventDefault();
      S.draft.pop();
      drawSvg(S);
      return;
    }
    if ((k === "Delete" || k === "Backspace") && !S.readOnly && S.sel) {
      e.preventDefault();
      const cur = S.shapes.find((x) => x.id === S.sel);
      if (!cur) return;
      snapshot(S);
      if (S.selVertex >= 0 && cur.points.length > 3) {
        cur.points.splice(S.selVertex, 1);
        S.selVertex = -1;
      } else if (confirm(`Delete this ${cur.kind === "plot" ? "plot " + (cur.plot_no || "polygon") : cur.kind.replace("_", " ")}?`)) {
        S.shapes = S.shapes.filter((x) => x !== cur);
        S.sel = null;
      } else S.undo.pop();
      markDirty(S);
      renderPane(S);
      drawSvg(S);
    }
    const map = { v: "select", p: "draw", a: "trace", s: "calib" };
    if (!e.ctrlKey && !e.metaKey && map[k.toLowerCase()]) setTool(S, map[k.toLowerCase()]);
    if (k === "+" || k === "=") zoomBy(S, 1.3);
    if (k === "-") zoomBy(S, 1 / 1.3);
  });
  box.addEventListener("keyup", (e) => {
    if (e.key === " ") spaceDown = false;
  });
  new ResizeObserver(() => S.tx || fit(S)).observe(box);
  setTool(S, S.tool);
}

function suggestNumber(S) {
  const used = new Set(S.shapes.filter((s) => s.kind === "plot").map((s) => String(s.plot_no).toLowerCase()));
  const next = S.records.map((r) => String(r.plot)).sort(natural).find((n) => !used.has(n.toLowerCase()));
  return next || "";
}
function finishDraft(S) {
  const pts = S.draft;
  S.draft = null;
  S.cursor = null;
  if (!pts || pts.length < 3) return drawSvg(S);
  const p = polyProblem(pts);
  if (p) {
    CTX.toast(`Polygon not added: ${p}`);
    return drawSvg(S);
  }
  snapshot(S);
  const sh = { id: uid(), kind: "plot", plot_no: suggestNumber(S), plot_uid: "", label: "", points: pts };
  S.shapes.push(sh);
  S.sel = sh.id;
  S.tab = "shape";
  markDirty(S);
  syncTabs(S);
  renderPane(S);
  drawSvg(S);
}
function finishCalib(S) {
  const [a, b] = S.calib;
  const d = Math.hypot((a[0] - b[0]) * S.W, (a[1] - b[1]) * S.H);
  const m = prompt(`Distance between the two points is ${d.toFixed(1)} image pixels.\nEnter the real distance in metres (as labelled on the approved plan):`);
  S.calib = null;
  S.cursor = null;
  const n = Number(m);
  if (m && n > 0 && d > 5) {
    S.meta.metres_per_px = +(n / d).toFixed(8);
    S.meta.scale_note = `Calibrated on a ${n} m reference (${new Date().toLocaleDateString("en-IN")}). On-screen measurements are approximate.`;
    markDirty(S);
    CTX.toast(`Scale set: ${(1 / S.meta.metres_per_px).toFixed(2)} px per metre`);
    S.tab = "style";
    syncTabs(S);
    renderPane(S);
  }
  drawSvg(S);
}
function undo(S) {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.shapes));
  S.shapes = JSON.parse(S.undo.pop());
  if (!S.shapes.find((s) => s.id === S.sel)) S.sel = null;
  markDirty(S);
  renderPane(S);
  drawSvg(S);
}
function redo(S) {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.shapes));
  S.shapes = JSON.parse(S.redo.pop());
  markDirty(S);
  renderPane(S);
  drawSvg(S);
}
function syncTabs(S) {
  S.root.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x.dataset.tab === S.tab));
}

function statusOf(S, sh) {
  const r = recordFor(S, sh.plot_no);
  return r ? String(r.status || "available").toLowerCase() : null;
}

function drawSvg(S) {
  const svg = S.root.querySelector("#lm-svg");
  if (!svg || !S.tx) return;
  const k = 1 / S.tx.s;
  const P = (pts) => pts.map(([x, y]) => `${(x * S.W).toFixed(1)},${(y * S.H).toFixed(1)}`).join(" ");
  const dupes = new Map();
  S.shapes.filter((s) => s.kind === "plot" && s.plot_no).forEach((s) => dupes.set(s.plot_no.toLowerCase(), (dupes.get(s.plot_no.toLowerCase()) || 0) + 1));
  let out = "";
  for (const sh of S.shapes) {
    const sel = sh.id === S.sel;
    const bad = polyProblem(sh.points) || (sh.kind === "plot" && (!sh.plot_no || !recordFor(S, sh.plot_no) || dupes.get(sh.plot_no.toLowerCase()) > 1));
    let fill = KIND_COLOR[sh.kind];
    let op = sh.kind === "plot" ? 0.16 : 0.22;
    if (sh.kind === "plot") {
      const st = statusOf(S, sh);
      if (st && DEFAULT_TINT[st]) {
        const o = S.meta.style?.status?.[st] || {};
        fill = o.color || DEFAULT_TINT[st].color;
        op = Math.max(0.16, (typeof o.opacity === "number" ? o.opacity : DEFAULT_TINT[st].opacity) + 0.06);
      }
    }
    out += `<polygon points="${P(sh.points)}" style="fill:${bad ? "#e11b22" : fill};fill-opacity:${sel ? 0.28 : op};stroke:${bad ? "#e11b22" : sel ? "#111" : KIND_COLOR[sh.kind]};stroke-width:${(sel ? 2.5 : 1.4) * k};stroke-linejoin:round${bad ? `;stroke-dasharray:${6 * k} ${4 * k}` : ""}"/>`;
    if (S.showNumbers) {
      const cx = sh.points.reduce((a, p) => a + p[0], 0) / sh.points.length * S.W;
      const cy = sh.points.reduce((a, p) => a + p[1], 0) / sh.points.length * S.H;
      const text = sh.kind === "plot" ? sh.plot_no || "?" : sh.label || sh.kind.replace("_", " ");
      out += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" style="font:700 ${12 * k}px Inter,sans-serif;fill:#fff;stroke:${bad ? "#e11b22" : "#141a2e"};stroke-width:${3.2 * k};paint-order:stroke;pointer-events:none">${esc(text)}</text>`;
    }
    if (sel && !S.readOnly && S.tool === "select") {
      sh.points.forEach(([x, y], i) => {
        out += `<circle cx="${x * S.W}" cy="${y * S.H}" r="${(i === S.selVertex ? 6 : 4.5) * k}" style="fill:${i === S.selVertex ? "#e11b22" : "#fff"};stroke:#111;stroke-width:${1.5 * k}"/>`;
      });
    }
  }
  if (S.draft) {
    const pts = S.cursor ? [...S.draft, S.cursor] : S.draft;
    out += `<polyline points="${P(pts)}" style="fill:rgba(37,99,235,.12);stroke:#2563eb;stroke-width:${2 * k};stroke-dasharray:${6 * k} ${4 * k}"/>`;
    S.draft.forEach(([x, y], i) => (out += `<circle cx="${x * S.W}" cy="${y * S.H}" r="${(i === 0 ? 6 : 4) * k}" style="fill:${i === 0 ? "#2563eb" : "#fff"};stroke:#2563eb;stroke-width:${1.5 * k}"/>`));
  }
  if (S.calib) {
    const pts = S.cursor && S.calib.length === 1 ? [...S.calib, S.cursor] : S.calib;
    out += `<polyline points="${P(pts)}" style="fill:none;stroke:#e0a423;stroke-width:${2.5 * k}"/>`;
    pts.forEach(([x, y]) => (out += `<circle cx="${x * S.W}" cy="${y * S.H}" r="${5 * k}" style="fill:#e0a423;stroke:#111;stroke-width:${1.2 * k}"/>`));
  }
  svg.innerHTML = out;
}

/* ───────────────────────── side panel ───────────────────────── */
function renderPane(S) {
  const pane = S.root.querySelector("#lm-pane");
  if (!pane) return;
  ({ shape: paneShape, plots: panePlots, review: paneReview, style: paneStyle }[S.tab])(S, pane);
}

function paneShape(S, pane) {
  const sh = S.shapes.find((x) => x.id === S.sel);
  if (!sh) {
    const counts = KINDS.map(([k, l]) => [l, S.shapes.filter((s) => s.kind === k).length]).filter(([, n]) => n);
    pane.innerHTML = `
      <p class="lm-hint" style="margin-top:0">Select a shape on the layout, or use <b>Draw polygon</b> / <b>Auto-trace</b> to add one.</p>
      <div class="lm-kv">${counts.map(([l, n]) => `<b>${l}</b><span>${n}</span>`).join("") || "<span class='muted'>No shapes yet.</span>"}</div>
      <hr style="border:none;border-top:1px solid var(--hair);margin:14px 0">
      <p class="lm-hint"><b>Mouse:</b> wheel zooms · drag empty space (or hold Space / middle button) pans.<br>
      <b>Keys:</b> V select · P draw · A auto-trace · S scale · Delete remove · Ctrl+Z undo.</p>`;
    return;
  }
  const rec = sh.kind === "plot" ? recordFor(S, sh.plot_no) : null;
  const opts = S.records.map((r) => String(r.plot)).sort(natural);
  const mappedElsewhere = (no) => S.shapes.some((s) => s !== sh && s.kind === "plot" && String(s.plot_no).toLowerCase() === String(no).toLowerCase());
  const prob = polyProblem(sh.points);
  pane.innerHTML = `
    <label style="margin-top:0">Shape type</label>
    <select id="sh-kind" ${S.readOnly ? "disabled" : ""}>${KINDS.map(([k, l]) => `<option value="${k}" ${sh.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${
      sh.kind === "plot"
        ? `<label>Plot number <span class="muted">(exactly as printed on the plan)</span></label>
      <input id="sh-no" list="sh-nos" value="${esc(sh.plot_no)}" ${S.readOnly ? "disabled" : ""}>
      <datalist id="sh-nos">${opts.map((o) => `<option value="${esc(o)}">${mappedElsewhere(o) ? "already mapped" : "not mapped yet"}</option>`).join("")}</datalist>
      ${!sh.plot_no ? `<div class="lm-err">No plot number assigned.</div>` : ""}
      ${sh.plot_no && mappedElsewhere(sh.plot_no) ? `<div class="lm-err">Plot ${esc(sh.plot_no)} is drawn more than once.</div>` : ""}
      ${sh.plot_no && !rec ? `<div class="lm-err">No plot record ${esc(sh.plot_no)} exists. ${S.readOnly ? "" : `<button class="btn gold sm" id="sh-create" style="margin-top:6px">Create plot record ${esc(sh.plot_no)}</button>`}</div>` : ""}`
        : `<label>Label</label><input id="sh-label" value="${esc(sh.label)}" placeholder="e.g. 9.0 m road, Park" ${S.readOnly ? "disabled" : ""}>`
    }
    <p class="lm-hint">${sh.points.length} corners${prob ? ` · <span class="lm-err">${prob}</span>` : ""}</p>
    ${S.readOnly ? "" : `<button class="btn grey sm" id="sh-del">Delete shape</button>`}
    ${rec ? plotRecordForm(S, rec) : ""}`;
  const on = (id, ev, fn) => {
    const el = pane.querySelector(id);
    if (el) el[ev] = fn;
  };
  on("#sh-kind", "onchange", (e) => {
    snapshot(S);
    sh.kind = e.target.value;
    markDirty(S);
    renderPane(S);
    drawSvg(S);
  });
  on("#sh-no", "onchange", (e) => {
    snapshot(S);
    sh.plot_no = e.target.value.trim();
    sh.plot_uid = "";
    markDirty(S);
    renderPane(S);
    drawSvg(S);
  });
  on("#sh-label", "onchange", (e) => {
    sh.label = e.target.value;
    markDirty(S);
    drawSvg(S);
  });
  on("#sh-del", "onclick", () => {
    snapshot(S);
    S.shapes = S.shapes.filter((x) => x !== sh);
    S.sel = null;
    markDirty(S);
    renderPane(S);
    drawSvg(S);
  });
  on("#sh-create", "onclick", async () => {
    const { data, error } = await CTX.sb.rpc("admin_plot_upsert", { p_property: S.prop.id, p_plot: sh.plot_no, p_patch: { status: "not_released" } });
    if (error) return CTX.toast(error.message);
    S.records.push(data);
    CTX.toast(`Plot record ${sh.plot_no} created as “Not released”`);
    renderPane(S);
    drawSvg(S);
  });
  if (rec) bindRecordForm(S, pane, rec);
}

function plotRecordForm(S, rec) {
  const st = String(rec.status || "available").toLowerCase();
  const f = (k, l, ph = "") => `<div><label>${l}</label><input data-rec="${k}" value="${esc(rec[k] ?? "")}" placeholder="${ph}"></div>`;
  return `
    <hr style="border:none;border-top:1px solid var(--hair);margin:14px 0">
    <b>Plot record ${esc(rec.plot)}</b>
    <p class="lm-hint" style="margin:4px 0 0">Shared by the website and the app. Enter only verified figures. Saved immediately (not part of the draft).</p>
    <label>Status</label>
    <select data-rec="status">${STATUSES.map(([k, l]) => `<option value="${k}" ${st === k ? "selected" : ""}>${l}</option>`).join("")}</select>
    <div class="lm-grid2">
      ${f("dim_m", "Dimensions (m)", "12.19 x 17.90")}
      ${f("facing", "Facing", "East")}
      ${f("size_sqft", "Area (sq ft)")}
      ${f("size_sqm", "Area (sq m)")}
      ${f("road_m", "Road width (m)")}
      ${f("price", "Price (₹, blank = on request)")}
    </div>
    <div class="lm-row" style="margin-top:10px"><button class="btn sm" id="rec-save">Save plot record</button><span class="lm-hint" id="rec-msg"></span></div>
    <div id="rec-hist" class="lm-hint" style="margin-top:10px"></div>`;
}
async function bindRecordForm(S, pane, rec) {
  pane.querySelector("#rec-save").onclick = async () => {
    const patch = {};
    const bad = [];
    pane.querySelectorAll("[data-rec]").forEach((el) => {
      const k = el.dataset.rec;
      const val = el.value.trim();
      if (["size_sqft", "size_sqm", "road_m", "price"].includes(k)) {
        if (val === "") patch[k] = null;
        else if (!Number.isFinite(Number(val)) || Number(val) < 0) bad.push(k.replace("_", " "));
        else patch[k] = Number(val);
      } else patch[k] = val === "" ? null : val;
    });
    if (bad.length) return CTX.toast(`Enter a number for: ${bad.join(", ")}`);
    const msg = pane.querySelector("#rec-msg");
    msg.textContent = "Saving…";
    const { data, error } = await CTX.sb.rpc("admin_plot_upsert", { p_property: S.prop.id, p_plot: String(rec.plot), p_patch: patch });
    if (error) return (msg.textContent = ""), CTX.toast(error.message);
    const i = S.records.indexOf(rec);
    if (i >= 0) S.records[i] = data;
    msg.textContent = "Saved ✓";
    drawSvg(S);
    revalidateWebsite(S.prop);
    renderPane(S);
  };
  const { data: hist } = await CTX.sb
    .from("plot_status_history")
    .select("old_status,new_status,changed_at")
    .eq("property_id", S.prop.id)
    .eq("plot_no", String(rec.plot))
    .order("changed_at", { ascending: false })
    .limit(5);
  const el = pane.querySelector("#rec-hist");
  if (el && hist?.length) el.innerHTML = `<b>Status history</b><br>${hist.map((h) => `${fmt(h.changed_at)} — ${esc(h.old_status || "new")} → ${esc(h.new_status)}`).join("<br>")}`;
}

function panePlots(S, pane) {
  const mapped = new Map();
  S.shapes.filter((s) => s.kind === "plot").forEach((s) => mapped.set(String(s.plot_no).toLowerCase(), (mapped.get(String(s.plot_no).toLowerCase()) || 0) + 1));
  const recs = [...S.records].sort((a, b) => natural(a.plot, b.plot));
  const orphan = S.shapes.filter((s) => s.kind === "plot" && (!s.plot_no || !recordFor(S, s.plot_no)));
  const unmappedN = recs.filter((r) => !mapped.get(String(r.plot).toLowerCase())).length;
  pane.innerHTML = `
    <div class="lm-kv" style="margin-bottom:10px"><b>Plot records</b><span>${recs.length}</span><b>Drawn on this layout</b><span>${recs.length - unmappedN}</span><b>Not on this layout</b><span>${unmappedN}</span></div>
    <input id="pl-q" placeholder="Filter plot numbers" style="margin-bottom:8px">
    ${orphan.length ? `<div class="lm-err" style="margin-bottom:6px">${orphan.length} polygon(s) with no matching record</div>` : ""}
    <div class="lm-list" id="pl-list">${recs
      .map((r) => {
        const n = mapped.get(String(r.plot).toLowerCase()) || 0;
        const st = String(r.status || "available").toLowerCase();
        return `<div class="lm-item" data-no="${esc(r.plot)}"><span class="lm-dot" style="background:${(DEFAULT_TINT[st] || DEFAULT_TINT.available).color}"></span><b style="min-width:44px">${esc(r.plot)}</b><span class="lm-grow muted">${esc(st.replace("_", " "))}${r.dim_m ? " · " + esc(r.dim_m) : ""}</span>${n === 0 ? `<span class="pill warn">not drawn</span>` : n > 1 ? `<span class="pill red">×${n}</span>` : `<span class="pill ok">mapped</span>`}</div>`;
      })
      .join("")}</div>`;
  pane.querySelector("#pl-q").oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    pane.querySelectorAll("#pl-list .lm-item").forEach((it) => (it.style.display = !q || it.dataset.no.toLowerCase().includes(q) ? "" : "none"));
  };
  pane.querySelectorAll("#pl-list .lm-item").forEach(
    (it) =>
      (it.onclick = () => {
        const sh = S.shapes.find((s) => s.kind === "plot" && String(s.plot_no).toLowerCase() === it.dataset.no.toLowerCase());
        if (!sh) return CTX.toast(`Plot ${it.dataset.no} is not drawn — use Draw polygon or Auto-trace, then assign ${it.dataset.no}.`);
        S.sel = sh.id;
        focusShape(S, sh);
        S.tab = "shape";
        syncTabs(S);
        renderPane(S);
      }),
  );
}
function focusShape(S, sh) {
  const box = S.root.querySelector("#lm-box");
  const xs = sh.points.map((p) => p[0] * S.W), ys = sh.points.map((p) => p[1] * S.H);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const s = Math.min(4, Math.min(box.clientWidth / (bw * 4), box.clientHeight / (bh * 4)));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  S.tx = { s, x: box.clientWidth / 2 - cx * s, y: box.clientHeight / 2 - cy * s };
  applyTx(S);
}

function paneReview(S, pane) {
  const val = S.validation;
  const rv = S.meta.review;
  const open = rv.filter((r) => !r.resolved).length;
  pane.innerHTML = `
    <div class="lm-row" style="justify-content:space-between"><b>Validation</b><button class="btn grey sm" id="rv-run">Run checks</button></div>
    ${
      val
        ? `<p class="lm-hint">${val.counts ? `${val.counts.plots} plots drawn · ${val.counts.records} records · ${val.counts.roads} roads · ${val.counts.open_spaces} open spaces` : ""}${val.local ? " · <i>unsaved changes checked locally</i>" : ""}</p>
          ${val.errors.length ? val.errors.map((x) => `<div class="lm-err">✕ ${esc(x.message)}</div>`).join("") : `<div class="pill ok">No blocking problems</div>`}
          ${val.warnings.length ? `<details style="margin-top:8px"><summary class="lm-warn">${val.warnings.length} warning(s)</summary>${val.warnings.map((x) => `<div class="lm-warn">• ${esc(x.message)}</div>`).join("")}</details>` : ""}`
        : `<p class="lm-hint">Run checks before publishing.</p>`
    }
    <hr style="border:none;border-top:1px solid var(--hair);margin:14px 0">
    <div class="lm-row" style="justify-content:space-between"><b>Discrepancies for review (${open} open)</b>${S.readOnly ? "" : `<button class="btn grey sm" id="rv-add">Add</button>`}</div>
    <p class="lm-hint">Differences between the layout image and the plot records. Neither source is changed automatically — resolve each by correcting the record (or the mapping) and ticking it off. Open items on a plot show buyers a “being re-checked” note on that plot.</p>
    <div class="lm-list">${rv
      .map(
        (r, i) => `<div class="lm-item" style="cursor:default;align-items:flex-start;${r.resolved ? "opacity:.55" : ""}">
        <input type="checkbox" data-rv="${i}" ${r.resolved ? "checked" : ""} ${S.readOnly ? "disabled" : ""} style="width:auto;margin-top:2px">
        <div class="lm-grow">${r.plot ? `<b>Plot ${esc(r.plot)}</b> · ` : ""}<span>${esc(r.message)}</span>${r.note ? `<div class="lm-hint">Note: ${esc(r.note)}</div>` : ""}</div>
        ${S.readOnly ? "" : `<button class="btn grey sm" data-rvnote="${i}" title="Add a resolution note">✎</button>`}</div>`,
      )
      .join("") || "<span class='muted'>None.</span>"}</div>`;
  pane.querySelector("#rv-run").onclick = () => validate(S, false);
  pane.querySelectorAll("[data-rv]").forEach(
    (c) =>
      (c.onchange = () => {
        rv[+c.dataset.rv].resolved = c.checked;
        markDirty(S);
        renderPane(S);
      }),
  );
  pane.querySelectorAll("[data-rvnote]").forEach(
    (b) =>
      (b.onclick = () => {
        const r = rv[+b.dataset.rvnote];
        const n = prompt("Resolution note", r.note || "");
        if (n === null) return;
        r.note = n;
        markDirty(S);
        renderPane(S);
      }),
  );
  const add = pane.querySelector("#rv-add");
  if (add)
    add.onclick = () => {
      const plot = prompt("Plot number (leave blank for a general item)", "");
      if (plot === null) return;
      const message = prompt("Describe the discrepancy");
      if (!message) return;
      rv.push({ id: uid(), severity: "warning", plot: plot.trim() || undefined, message, resolved: false, source: "admin" });
      markDirty(S);
      renderPane(S);
    };
}

function paneStyle(S, pane) {
  const st = S.meta.style.status || {};
  const row = (key, label, def, obj) => `
    <div class="lm-row" style="margin:6px 0">
      <span style="min-width:96px">${label}</span>
      <input type="color" data-sty="${key}" data-f="color" value="${obj.color || def.color}" style="width:44px;padding:2px;height:32px" ${S.readOnly ? "disabled" : ""}>
      <input type="range" min="0" max="0.7" step="0.02" data-sty="${key}" data-f="opacity" value="${typeof obj.opacity === "number" ? obj.opacity : def.opacity}" style="flex:1;padding:0" ${S.readOnly ? "disabled" : ""}>
      <label class="lm-hint" style="margin:0;display:flex;gap:4px;align-items:center"><input type="checkbox" data-sty="${key}" data-f="visible" style="width:auto" ${obj.visible === false ? "" : "checked"} ${S.readOnly ? "disabled" : ""}>show</label>
    </div>`;
  pane.innerHTML = `
    <b>Status overlay</b>
    <p class="lm-hint" style="margin:4px 0 8px">Translucent tints drawn over each plot on the website and app. Keep them light so the plan's own numbers and dimensions stay readable.</p>
    ${STATUSES.map(([k, l]) => row(k, l, DEFAULT_TINT[k], st[k] || {})).join("")}
    <b style="display:block;margin-top:14px">Highlights (when the visitor turns them on)</b>
    ${row("road", "Roads", { color: "#e07a2e", opacity: 0.32 }, S.meta.style.road || {})}
    ${row("open_space", "Open space", { color: "#3f9c35", opacity: 0.32 }, S.meta.style.open_space || {})}
    ${S.readOnly ? "" : `<button class="btn grey sm" id="sty-reset" style="margin-top:6px">Reset to defaults</button>`}
    <hr style="border:none;border-top:1px solid var(--hair);margin:14px 0">
    <b>Scale</b>
    <div class="lm-kv" style="margin-top:6px"><b>Metres per image pixel</b><span>${S.meta.metres_per_px ? Number(S.meta.metres_per_px).toFixed(6) : "not set"}</span>
    ${S.meta.metres_per_px ? `<b>1 m on the image</b><span>${(1 / S.meta.metres_per_px).toFixed(2)} px</span>` : ""}</div>
    <label>Scale note (shown beside the Measure tool)</label>
    <textarea id="sty-note" ${S.readOnly ? "disabled" : ""}>${esc(S.meta.scale_note)}</textarea>
    ${S.readOnly ? "" : `<div class="lm-row"><button class="btn grey sm" id="sty-calib">📏 Calibrate on the image</button>${S.meta.metres_per_px ? `<button class="btn grey sm" id="sty-clear">Remove scale</button>` : ""}</div>`}
    <p class="lm-hint">Without a scale the Measure tool is hidden. Measurements are always labelled approximate; recorded plot dimensions remain the authority.</p>
    <label>Version note</label><textarea id="sty-vnote" ${S.readOnly ? "disabled" : ""}>${esc(S.meta.note)}</textarea>`;
  if (S.readOnly) return;
  pane.querySelectorAll("[data-sty]").forEach(
    (el) =>
      (el.oninput = () => {
        const key = el.dataset.sty, f = el.dataset.f;
        const target = key === "road" || key === "open_space" ? (S.meta.style[key] = S.meta.style[key] || {}) : ((S.meta.style.status = S.meta.style.status || {}), (S.meta.style.status[key] = S.meta.style.status[key] || {}));
        target[f] = f === "visible" ? el.checked : f === "opacity" ? Number(el.value) : el.value;
        markDirty(S);
        drawSvg(S);
      }),
  );
  pane.querySelector("#sty-reset").onclick = () => {
    S.meta.style = {};
    markDirty(S);
    renderPane(S);
    drawSvg(S);
  };
  pane.querySelector("#sty-note").onchange = (e) => ((S.meta.scale_note = e.target.value), markDirty(S));
  pane.querySelector("#sty-vnote").onchange = (e) => ((S.meta.note = e.target.value), markDirty(S));
  pane.querySelector("#sty-calib").onclick = () => setTool(S, "calib");
  const clr = pane.querySelector("#sty-clear");
  if (clr)
    clr.onclick = () => {
      S.meta.metres_per_px = null;
      markDirty(S);
      renderPane(S);
    };
}

/* ───────────────────────── save / validate / publish ───────────────────────── */
function payloadShapes(S) {
  return S.shapes.map((s) => ({ kind: s.kind, plot_no: s.kind === "plot" ? s.plot_no : null, plot_uid: s.kind === "plot" ? s.plot_uid || null : null, label: s.label || null, points: s.points.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]) }));
}
async function saveDraft(S, quiet) {
  if (S.readOnly) return true;
  const btn = S.root.querySelector("#lm-save");
  if (btn) (btn.disabled = true), (btn.textContent = "Saving…");
  const { error } = await CTX.sb.rpc("admin_layout_save", {
    p_version: S.v.id,
    p_property: S.prop.id,
    p_meta: { label: S.meta.label, metres_per_px: S.meta.metres_per_px ?? "", scale_note: S.meta.scale_note, style: S.meta.style, review: S.meta.review, note: S.meta.note },
    p_shapes: payloadShapes(S),
  });
  if (btn) (btn.disabled = false), (btn.textContent = "Save draft");
  if (error) {
    CTX.toast(error.message);
    return false;
  }
  S.dirty = false;
  const d = S.root.querySelector("#lm-dirty");
  if (d) d.style.display = "none";
  if (!quiet) CTX.toast("Draft saved");
  return true;
}
function localChecks(S) {
  const errors = [], warnings = [];
  const seen = new Map();
  S.shapes.forEach((s) => {
    const p = polyProblem(s.points);
    if (p) errors.push({ message: `${s.kind === "plot" ? "Plot " + (s.plot_no || "?") : s.label || s.kind}: ${p}` });
    if (s.kind === "plot") {
      if (!s.plot_no) errors.push({ message: "A plot polygon has no plot number" });
      else {
        if (!recordFor(S, s.plot_no)) errors.push({ message: `Plot ${s.plot_no} is drawn but has no plot record` });
        const k = s.plot_no.toLowerCase();
        seen.set(k, (seen.get(k) || 0) + 1);
      }
    }
  });
  seen.forEach((n, k) => n > 1 && errors.push({ message: `Plot ${k} is drawn ${n} times` }));
  S.records.forEach((r) => !seen.get(String(r.plot).toLowerCase()) && warnings.push({ message: `Plot record ${r.plot} is not on this layout` }));
  S.meta.review.filter((r) => !r.resolved).forEach((r) => warnings.push({ message: (r.plot ? `Plot ${r.plot}: ` : "") + r.message }));
  if (!S.meta.metres_per_px) warnings.push({ message: "No scale calibrated — the Measure tool will be hidden" });
  return { errors, warnings, local: true, counts: { plots: S.shapes.filter((s) => s.kind === "plot").length, records: S.records.length, roads: S.shapes.filter((s) => s.kind === "road").length, open_spaces: S.shapes.filter((s) => s.kind === "open_space").length } };
}
async function validate(S, switchTab) {
  if (S.dirty || S.readOnly) {
    S.validation = localChecks(S);
  } else {
    const { data, error } = await CTX.sb.rpc("admin_layout_validate", { p_version: S.v.id });
    if (error) return CTX.toast(error.message);
    S.validation = data;
  }
  if (switchTab) {
    S.tab = "review";
    syncTabs(S);
  }
  renderPane(S);
  return S.validation;
}

async function publishFlow(S) {
  if (S.dirty && !(await saveDraft(S, true))) return;
  const { data: val, error } = await CTX.sb.rpc("admin_layout_validate", { p_version: S.v.id });
  if (error) return CTX.toast(error.message);
  S.validation = val;
  renderPane(S);
  const errs = val.errors || [], warns = val.warnings || [];
  const body = errs.length
    ? `<p><b>Publishing is blocked by ${errs.length} problem(s):</b></p>${errs.map((x) => `<div class="lm-err">✕ ${esc(x.message)}</div>`).join("")}
       <div class="lm-row" style="justify-content:flex-end;margin-top:14px"><button class="btn grey" onclick="closeModal()">Back to the editor</button></div>`
    : `<p>This publishes <b>v${S.v.version_no}</b> of <b>${esc(S.prop.title)}</b> to the website and the Jamin Bazaar app, replacing ${S.prop.plan_image ? `v${S.prop.plan_image.version_no}` : "the current plan view"}.
        It will be locked after publishing; later changes need a new revision.</p>
       <div class="lm-kv"><b>Plots drawn</b><span>${val.counts.plots} of ${val.counts.records} records</span><b>Roads</b><span>${val.counts.roads}</span><b>Open spaces</b><span>${val.counts.open_spaces}</span><b>Reserved</b><span>${val.counts.reserved}</span></div>
       ${warns.length ? `<details open style="margin-top:12px"><summary class="lm-warn"><b>${warns.length} warning(s) to acknowledge</b></summary><div style="max-height:220px;overflow:auto">${warns.map((x) => `<div class="lm-warn">• ${esc(x.message)}</div>`).join("")}</div></details>` : ""}
       <label>Approval note</label><textarea id="pb-note" placeholder="e.g. Checked against DTCP sanctioned plan"></textarea>
       <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500"><input type="checkbox" id="pb-ok" style="width:auto;margin-top:2px">
        I have checked the polygons against the original layout${warns.length ? ` and reviewed the ${warns.length} warning(s)` : ""}, and approve publishing this layout.</label>
       <div class="lm-row" style="justify-content:flex-end;margin-top:14px"><button class="btn grey" onclick="closeModal()">Cancel</button><button class="btn green" id="pb-go" disabled>Publish to website and app</button></div>`;
  CTX.modal(`Publish layout v${S.v.version_no}`, body);
  const ok = document.getElementById("pb-ok");
  const go = document.getElementById("pb-go");
  if (!ok) return;
  ok.onchange = () => (go.disabled = !ok.checked);
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = "Publishing…";
    const { error: pe } = await CTX.sb.rpc("admin_layout_publish", { p_version: S.v.id, p_note: document.getElementById("pb-note").value, p_acknowledge: true });
    if (pe) {
      go.disabled = false;
      go.textContent = "Publish to website and app";
      return CTX.toast(pe.message);
    }
    await revalidateWebsite(S.prop);
    CTX.closeModal();
    CTX.toast(`Layout v${S.v.version_no} published`);
    window.onbeforeunload = null;
    renderHome(S.root, S.prop.id);
  };
}

async function replaceImage(S, file) {
  if (!confirm("Replace this draft's image? Polygons keep their proportional positions — check every one against the new image before publishing.")) return;
  status(S, "Uploading replacement image…");
  try {
    const { source, w, h } = await fileToCanvasSource(file);
    const disp = await rendition(source, w, h, 1600, 0.86);
    const hi = w > 1600 ? await rendition(source, w, h, 12000, 0.82) : null;
    const dir = `${S.prop.id}/layouts/${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const put = async (path, blob, type) => {
      const { error } = await CTX.sb.storage.from("property-media").upload(path, blob, { upsert: false, contentType: type, cacheControl: "31536000" });
      if (error) throw error;
      return CTX.sb.storage.from("property-media").getPublicUrl(path).data.publicUrl;
    };
    const source_url = await put(`${dir}/original-${file.name.replace(/[^\w.-]+/g, "_").slice(-80)}`, file, file.type || "application/octet-stream");
    const image_url = await put(`${dir}/display.${disp.ext}`, disp.blob, disp.blob.type);
    const image_hi_url = hi ? await put(`${dir}/hi.${hi.ext}`, hi.blob, hi.blob.type) : null;
    const W = hi ? hi.w : disp.w, H = hi ? hi.h : disp.h;
    if (!(await saveDraft(S, true))) return;
    const { error } = await CTX.sb.rpc("admin_layout_save", {
      p_version: S.v.id,
      p_property: S.prop.id,
      p_meta: { source_name: file.name, source_url, image_url, image_hi_url, image_w: W, image_h: H, metres_per_px: "" },
      p_shapes: null,
    });
    if (error) throw error;
    CTX.toast("Image replaced — scale cleared, recalibrate it");
    openEditor(S.root, S.prop.id, S.v.id);
  } catch (e) {
    status(S, "");
    CTX.toast(e.message || String(e));
  }
}

/* ───────────────────────── preview ───────────────────────── */
function preview(S) {
  const devices = [
    ["desktop", "Desktop", 1280, 800],
    ["tablet", "Tablet", 768, 1024],
    ["mobile", "Mobile", 375, 740],
  ];
  CTX.modal(
    "Preview",
    `<div class="lm-pv">
      <div class="lm-row">${devices.map(([k, l]) => `<button class="lm-tool ${k === "desktop" ? "on" : ""}" data-dev="${k}">${l}</button>`).join("")}</div>
      <p class="lm-hint" style="margin:0">Uses the unsaved polygons and colours. Tap a plot to see what visitors will see; drag to pan, wheel to zoom.</p>
      <div id="pv-host"></div></div>`,
  );
  const host = document.getElementById("pv-host");
  const show = (key) => {
    document.querySelectorAll("[data-dev]").forEach((b) => b.classList.toggle("on", b.dataset.dev === key));
    const [, , dw, dh] = devices.find((d) => d[0] === key);
    const maxW = Math.min(window.innerWidth * 0.8, 1100), maxH = window.innerHeight * 0.62;
    const k = Math.min(1, maxW / dw, maxH / dh);
    host.innerHTML = `<div style="width:${dw * k + 20}px;height:${dh * k + 20}px"><div class="lm-device" style="width:${dw}px;height:${dh}px;transform:scale(${k});transform-origin:0 0">
      <div id="pv-plan" style="position:absolute;inset:0;overflow:hidden;touch-action:none;background:#f6f4ef"><div id="pv-stage" style="position:absolute;left:0;top:0;transform-origin:0 0;width:${S.W}px;height:${S.H}px">
      <img src="${esc(S.v.image_url)}" style="width:100%;height:100%;display:block" draggable="false"><svg viewBox="0 0 ${S.W} ${S.H}" style="position:absolute;inset:0;width:100%;height:100%"></svg></div></div>
      <div id="pv-sheet" style="display:none;position:absolute;${dw < 640 ? "left:0;right:0;bottom:0;max-height:55%;border-radius:18px 18px 0 0" : "top:0;right:0;bottom:0;width:340px"};background:#fff;box-shadow:0 -10px 30px rgba(0,0,0,.18);padding:16px;overflow:auto;font-size:14px"></div>
    </div></div>`;
    const plan = host.querySelector("#pv-plan"), stage = host.querySelector("#pv-stage"), svg = host.querySelector("svg"), sheet = host.querySelector("#pv-sheet");
    let t = { s: dw / S.W, x: 0, y: 0 };
    let sel = null;
    const paint = () => {
      stage.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.s})`;
      svg.innerHTML = S.shapes
        .filter((s) => s.kind === "plot" && recordFor(S, s.plot_no))
        .map((s) => {
          const st = statusOf(S, s);
          const o = S.meta.style?.status?.[st] || {};
          const d = DEFAULT_TINT[st] || DEFAULT_TINT.available;
          const on = sel === s.id;
          return `<polygon points="${s.points.map(([x, y]) => `${x * S.W},${y * S.H}`).join(" ")}" style="fill:${on ? "#d4a017" : o.color || d.color};fill-opacity:${on ? 0.2 : o.visible === false ? 0 : typeof o.opacity === "number" ? o.opacity : d.opacity};stroke:${on ? "#8a5a00" : "none"};stroke-width:${3.5 / t.s}"/>`;
        })
        .join("");
    };
    paint();
    let dragS = null;
    plan.onpointerdown = (e) => {
      dragS = { x: e.clientX, y: e.clientY, t: { ...t }, moved: false };
      plan.setPointerCapture(e.pointerId);
    };
    plan.onpointermove = (e) => {
      if (!dragS) return;
      const dx = (e.clientX - dragS.x) / k, dy = (e.clientY - dragS.y) / k;
      if (Math.hypot(dx, dy) > 4) dragS.moved = true;
      if (dragS.moved) (t = { ...dragS.t, x: dragS.t.x + dx, y: dragS.t.y + dy }), paint();
    };
    plan.onpointerup = (e) => {
      const d = dragS;
      dragS = null;
      if (!d || d.moved) return;
      const r = plan.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / k - t.x) / t.s / S.W, ny = ((e.clientY - r.top) / k - t.y) / t.s / S.H;
      const hit = S.shapes.filter((s) => s.kind === "plot").find((s) => pointIn(nx, ny, s.points));
      const rec = hit && recordFor(S, hit.plot_no);
      sel = rec ? hit.id : null;
      paint();
      if (!rec) return (sheet.style.display = "none");
      const st = String(rec.status || "available").toLowerCase();
      sheet.style.display = "block";
      sheet.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:22px">Plot ${esc(rec.plot)}</b><span class="pill ${st === "available" ? "ok" : "grey"}">${esc((STATUSES.find((x) => x[0] === st) || [, st])[1])}</span></div>
        <div style="color:#666;margin:6px 0 10px">${rec.price ? "₹" + Number(rec.price).toLocaleString("en-IN") : "Pricing on request"}</div>
        <div class="lm-kv">${rec.size_sqft ? `<b>Area</b><span>${Number(rec.size_sqft).toLocaleString("en-IN")} sq ft</span>` : ""}${rec.size_sqm ? `<b>Area (sq m)</b><span>${rec.size_sqm}</span>` : ""}${rec.dim_m ? `<b>Dimensions</b><span>${esc(rec.dim_m)} m</span>` : ""}${rec.facing ? `<b>Facing</b><span>${esc(rec.facing)}</span>` : ""}${rec.road_m ? `<b>Road width</b><span>${rec.road_m} m</span>` : ""}</div>
        ${S.meta.review.some((r) => !r.resolved && String(r.plot) === String(rec.plot)) ? `<p class="lm-warn">Shown to visitors: figures being re-checked against the approved layout.</p>` : ""}
        ${st === "available" ? `<div class="btn" style="margin-top:12px;text-align:center">Book a site visit</div>` : ""}`;
    };
    plan.onwheel = (e) => {
      e.preventDefault();
      const r = plan.getBoundingClientRect();
      const cx = (e.clientX - r.left) / k, cy = (e.clientY - r.top) / k;
      const f = Math.exp(-e.deltaY * 0.0022);
      const s = Math.max(Math.min(dw / S.W, dh / S.H), Math.min(3, t.s * f));
      const q = s / t.s;
      t = { s, x: cx - (cx - t.x) * q, y: cy - (cy - t.y) * q };
      paint();
    };
  };
  document.querySelectorAll("[data-dev]").forEach((b) => (b.onclick = () => show(b.dataset.dev)));
  show("desktop");
}
