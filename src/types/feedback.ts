export type FeedbackItem = {
  id: string;
  createdAt: string;
  /** 1–5 labels shown on the cloud only */
  tags: string[];
  /** Stored for admin / JSON; not shown on clouds */
  comment: string;
  /** Optional legacy inline image payload; kept only for older records */
  imageDataUrl?: string;
  /** Preferred image storage: Vercel Blob or other hosted URL */
  imageUrl?: string;
  /** Legacy single tag */
  tag?: string;
  /** Legacy single text field */
  text?: string;
};
