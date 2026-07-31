// Public Community pages proxy (§5).
// Same reason as share-page.mjs: Supabase Edge Functions force `text/html`
// responses to `text/plain` on their default domain (anti-phishing), so a
// visitor would see the page source instead of the page. This thin Netlify
// Function fronts /c/* on the branded domain, forwards to the Supabase
// `community` function, and restores the correct content type.
//
//   /c                     → community index
//   /c/<postId>            → one post + its thread
//   /c/api/<endpoint>      → guest OTP / action API (POST, returns JSON)
//
// Query strings are preserved end to end — §9 referral attribution rides on
// ?ref= / ?utm_campaign=, and losing it here would silently orphan every lead.
const UPSTREAM = "https://zmxqozvivdluuxvvcegs.supabase.co/functions/v1";

export default async (req) => {
  const url = new URL(req.url);
  let segs = url.pathname.split("/").filter(Boolean);
  const k = segs.indexOf("community-page");
  if (k >= 0) segs = segs.slice(k + 1); // direct /.netlify/functions/community-page/... call
  else if (segs[0] === "c") segs = segs.slice(1); // normal /c/... route

  const rest = segs.map(encodeURIComponent).join("/");
  const target = `${UPSTREAM}/community${rest ? "/" + rest : ""}${url.search}`;

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

export const config = { path: ["/c", "/c/*"] };
