const MAX_TAGS = 5;
const MAX_TAG_LEN = 32;

export function parseTagsFromPayload(tags: unknown, tagFallback?: string): string[] {
  let raw: string[] = [];
  if (Array.isArray(tags)) {
    raw = tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof tagFallback === "string" && tagFallback.trim()) {
    raw = tagFallback
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const piece = t.slice(0, MAX_TAG_LEN);
    const key = piece.toLowerCase();
    if (!piece || seen.has(key)) continue;
    seen.add(key);
    out.push(piece);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
