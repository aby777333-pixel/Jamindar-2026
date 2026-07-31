/**
 * Image sizing.
 *
 * Every photo in this app is uploaded once at full resolution and then shown
 * in a 168px card, a 96px tile or a 38px avatar — but the full file was
 * downloaded every time. A property card was pulling 250 KB to fill a
 * thumbnail that needs 5.6 KB, so a twenty-card list cost ~5 MB on a phone
 * that is often on mobile data.
 *
 * Supabase Storage can resize on its CDN, so asking for the size we are
 * actually going to draw costs nothing and is cached at the edge.
 *
 * Rules kept deliberately narrow so this can never break an image:
 *  - only Supabase *public storage* URLs are rewritten,
 *  - anything already pointing at /render/image/ is left alone,
 *  - anything else (remote logos, data URIs, OSM tiles) passes through as-is.
 */
type Fit = "cover" | "contain" | "fill";

export function sized(
  url: string | null | undefined,
  width: number,
  height?: number,
  opts: { quality?: number; resize?: Fit } = {},
): string | undefined {
  if (!url) return undefined;
  if (!url.includes("/storage/v1/object/public/")) return url;
  if (url.includes("/render/image/")) return url;

  const [base, query] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("width", String(Math.round(width)));
  if (height) params.set("height", String(Math.round(height)));
  params.set("resize", opts.resize ?? "cover");
  params.set("quality", String(opts.quality ?? 72));

  return base.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?" + params.toString();
}

/** Common sizes, so call sites read as intent rather than magic numbers.
 *  Each is ~2x its layout box, which keeps it crisp on a 3x screen without
 *  paying for the full original. */
export const IMG = {
  /** 38–44px avatars and author chips. */
  avatar: (url?: string | null) => sized(url, 96, 96, { quality: 70 }),
  /** Media strip and gallery thumbnails. */
  tile: (url?: string | null) => sized(url, 260, 200, { quality: 72 }),
  /** Property/list card artwork. */
  card: (url?: string | null) => sized(url, 340, 260, { quality: 72 }),
  /** Full-bleed hero at the top of a detail screen. */
  hero: (url?: string | null) => sized(url, 1000, 700, { quality: 78 }),
};
