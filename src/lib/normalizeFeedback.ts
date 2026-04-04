import { FeedbackItem } from "@/types/feedback";

function collectTags(raw: FeedbackItem): string[] {
  if (Array.isArray(raw.tags) && raw.tags.length > 0) {
    const cleaned = raw.tags
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 5);
    if (cleaned.length > 0) return cleaned;
  }
  if (raw.tag?.trim()) {
    return raw.tag
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  return ["Note"];
}

export function normalizeFeedbackItem(raw: FeedbackItem): FeedbackItem {
  const tags = collectTags(raw);
  const comment = (raw.comment ?? raw.text ?? "").trim();
  const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl.trim() : undefined;
  return {
    ...raw,
    tags,
    comment: comment.length > 0 ? comment : tags.join(", "),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export function normalizeFeedbackList(list: FeedbackItem[]): FeedbackItem[] {
  return list.map(normalizeFeedbackItem);
}
