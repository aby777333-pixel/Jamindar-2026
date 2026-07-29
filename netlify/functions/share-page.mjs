// Branded share/invite pages proxy (0053).
// Supabase Edge Functions force `text/html` responses to `text/plain` on their
// default domain (anti-phishing), which makes browsers render the page source
// as text. This thin Netlify Function fronts /s/* (project share) and /i/*
// (promoter invite), forwards to the Supabase `share` function, and restores
// the correct content type. POSTs (lead capture, WhatsApp intents) pass through.
const UPSTREAM = "https://zmxqozvivdluuxvvcegs.supabase.co/functions/v1";

export default async (req) => {
  const url = new URL(req.url);
  let segs = url.pathname.split("/").filter(Boolean);
  const k = segs.indexOf("share-page");
  if (k >= 0) segs = segs.slice(k + 1); // direct /.netlify/functions/share-page/... invocation
  const mode = segs[0]; // 's' | 'i'
  const rest = segs.slice(1).map(encodeURIComponent).join("/");
  if (!rest || (mode !== "s" && mode !== "i")) {
    return new Response("Not found", { status: 404 });
  }
  const target =
    (mode === "i" ? `${UPSTREAM}/share/invite/${rest}` : `${UPSTREAM}/share/${rest}`) + url.search;

  const init = { method: req.method, redirect: "manual", headers: {} };
  if (req.method === "POST") {
    init.headers["Content-Type"] = req.headers.get("content-type") ?? "application/json";
    init.body = await req.text();
  }
  const resp = await fetch(target, init);
  const body = await resp.arrayBuffer();
  const headers = new Headers();
  headers.set("Cache-Control", resp.headers.get("cache-control") ?? "public, max-age=0, s-maxage=60");
  if (resp.headers.get("location")) headers.set("Location", resp.headers.get("location"));
  const upstreamCt = resp.headers.get("content-type") ?? "";
  headers.set(
    "Content-Type",
    req.method === "GET" && upstreamCt.startsWith("text/plain")
      ? "text/html; charset=utf-8"
      : upstreamCt || "text/html; charset=utf-8"
  );
  return new Response(body, { status: resp.status, headers });
};

export const config = { path: ["/s/*", "/i/*"] };
