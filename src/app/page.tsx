"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CSSProperties } from "react";
import { FeedbackItem } from "@/types/feedback";

export default function Home() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch("/api/feedback", { cache: "no-store" });
        const data = (await response.json()) as { items: FeedbackItem[] };
        setItems(data.items || []);
      } catch {
        setStatus("Unable to load feedback yet.");
      }
    };
    run();
  }, []);

  const layeredItems = useMemo(() => {
    return items.map((item, index) => ({
      ...item,
      lane: index % 5,
      depth: index % 3,
      delay: (index % 8) * 0.9,
    }));
  }, [items]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setStatus("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await response.json()) as { item?: FeedbackItem; error?: string };

      if (!response.ok || !data.item) {
        throw new Error(data.error || "Upload failed.");
      }

      setItems((prev) => [data.item!, ...prev].slice(0, 20));
      setNewlyAddedId(data.item.id);
      setText("");
      setStatus("Uploaded. Your cloud is floating up.");
      window.setTimeout(() => setNewlyAddedId(null), 1600);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="sky-page">
      <div className="sun-glow" aria-hidden />
      <section className="sky-field" aria-label="Floating feedback clouds">
        {layeredItems.map((item) => (
          <article
            key={item.id}
            className={[
              "cloud",
              `lane-${item.lane}`,
              `depth-${item.depth}`,
              item.id === newlyAddedId ? "rising" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                animationDelay: `${item.delay}s`,
                "--cloud-width": `clamp(170px, ${190 + item.text.length * 4}px, 480px)`,
              } as CSSProperties
            }
          >
            <span className="cloud-bumps" aria-hidden />
            <p>{item.text}</p>
          </article>
        ))}
      </section>

      <section className="feedback-bar-wrap">
        <p className="hint">Please give sunburella feedback</p>
        <form className="feedback-form" onSubmit={handleSubmit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your feedback..."
            maxLength={300}
            disabled={isSubmitting}
          />
          <button type="submit" disabled={isSubmitting || !text.trim()}>
            {isSubmitting ? "Uploading..." : "Upload"}
          </button>
        </form>
        {status ? <p className="status">{status}</p> : null}
      </section>
    </main>
  );
}
