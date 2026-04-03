export type FeedbackItem = {
  id: string;
  createdAt: string;
  /** 1–5 labels shown on the cloud only */
  tags: string[];
  /** Stored for admin / JSON; not shown on clouds */
  comment: string;
  /** Optional; stored in JSON only, not shown on clouds */
  imageDataUrl?: string;
  /** Legacy single tag */
  tag?: string;
  /** Legacy single text field */
  text?: string;
};
