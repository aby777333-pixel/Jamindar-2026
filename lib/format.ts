// Money & area formatting for the Indian market (lakh/crore).
export function formatINR(value?: number | null): string {
  if (value == null) return "—";
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

/** Price text that respects stock — a sold-out listing never shows a price ask. */
export function priceLabel(price?: number | null, status?: string | null): string {
  if (status === "sold") return "Sold out";
  return price != null ? formatINR(price) : "On request";
}

export function formatArea(value?: number | null, unit?: string | null): string {
  if (value == null) return "—";
  const u = unit ?? "sqft";
  const label: Record<string, string> = {
    sqft: "sq.ft",
    grounds: "grounds",
    acres: "acres",
    hectares: "hectares",
  };
  return `${value.toLocaleString("en-IN")} ${label[u] ?? u}`;
}

export function initials(name?: string | null): string {
  if (!name) return "J";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/**
 * Greeting for the device's own clock and timezone.
 * `getHours()` is local time, so a user in Erode and one abroad each get the
 * greeting that matches the time they are actually looking at.
 */
export function greetingFor(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Good Night";
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
}
