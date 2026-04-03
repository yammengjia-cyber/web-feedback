"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CSSProperties } from "react";
import { parseTagsFromPayload } from "@/lib/parseTags";
import { FeedbackItem } from "@/types/feedback";

/** ~2.8 MB；Base64 后体积更大，需与 MAX_IMAGE_DATA_URL_CHARS、托管商请求体上限一致 */
const MAX_FILE_BYTES = 2_800_000;

function isLikelyPhotoFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name);
}

export default function Home() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [comment, setComment] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [thanksShow, setThanksShow] = useState(false);
  const [thanksKey, setThanksKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const perLane = Math.max(Math.ceil(items.length / 3), 1);
    const latestId = items[0]?.id;
    return items.map((item, index) => {
      const idSum = item.id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const lane = index % 3;
      const depth = index % 3;
      const slotInLane = Math.floor(index / 3);
      const phase01 = ((index * 17 + idSum * 5) % 997) / 997;
      const driftBaseByLane = [18.5, 24.2, 20.4][lane];
      const driftSec = driftBaseByLane + (idSum % 6) * 0.65;
      const delay = -((slotInLane + phase01 * 0.92) / perLane) * driftSec;
      const staggerY = ((index * 5 + idSum) % 5) - 2;
      const nudgeX = ((idSum + index * 2) % 5) - 2;
      return {
        ...item,
        lane,
        depth,
        delay,
        driftSec,
        staggerY,
        nudgeX,
        isLatest: item.id === latestId,
      };
    });
  }, [items]);

  const resetModal = () => {
    setTagsInput("");
    setComment("");
    setImageDataUrl(null);
    setImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    resetModal();
  };

  const onPickImage = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      setImageDataUrl(null);
      setImageName(null);
      return;
    }
    if (!isLikelyPhotoFile(file)) {
      setStatus("Please choose a photo (JPEG, PNG, WebP, or iPhone HEIC).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus("Image is too large. Try under about 2.8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      setStatus("Could not read this file. On some devices, try “Most Compatible” photos or export as JPEG.");
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setImageDataUrl(result);
        setImageName(file.name);
        setStatus("");
      }
    };
    reader.readAsDataURL(file);
  };

  const tagsValid = parseTagsFromPayload(undefined, tagsInput).length > 0;

  const handleModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tags = parseTagsFromPayload(undefined, tagsInput);
    if (tags.length === 0 || !comment.trim()) return;

    setIsSubmitting(true);
    setStatus("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags,
          comment: comment.trim(),
          ...(imageDataUrl ? { imageDataUrl } : {}),
        }),
      });
      const data = (await response.json()) as { item?: FeedbackItem; error?: string };

      if (!response.ok || !data.item) {
        throw new Error(data.error || "Upload failed.");
      }

      setItems((prev) => [data.item!, ...prev].slice(0, 20));
      setNewlyAddedId(data.item.id);
      closeModal();
      setStatus("");
      setThanksKey((k) => k + 1);
      setThanksShow(true);
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
        {[0, 1, 2].map((lane) => (
          <div key={lane} className={`sky-lane sky-lane-${lane}`}>
            {layeredItems
              .filter((row) => row.lane === lane)
              .map((item) => (
                <div
                  key={item.id}
                  className={["cloud-anchor", `depth-${item.depth}`].join(" ")}
                  style={
                    {
                      "--anchor-y": `${item.staggerY}px`,
                      "--anchor-x": `${item.nudgeX}px`,
                    } as CSSProperties
                  }
                >
                  <div
                    className={["cloud-drift", item.id === newlyAddedId ? "rising" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        "--drift-delay": `${item.delay}s`,
                        "--drift-duration": `${item.driftSec}s`,
                      } as CSSProperties
                    }
                  >
                    <article className="cloud">
                      <div
                        className={["cloud-body", item.isLatest ? "cloud-latest" : ""]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="cloud-tags" aria-label="Tags">
                          {item.tags.map((t) => (
                            <span key={`${item.id}-${t}`} className="cloud-tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </section>

      <section className="feedback-bar-wrap">
        <p className="hint">Please give sunburella feedback</p>
        <div className="feedback-trigger-row">
          <button
            type="button"
            className="uploading-trigger"
            onClick={() => {
              setModalOpen(true);
              setStatus("");
            }}
          >
            Uploading
          </button>
        </div>
        {status ? <p className="status">{status}</p> : null}
      </section>

      {thanksShow ? (
        <div className="thanks-layer" aria-live="polite">
          <div
            key={thanksKey}
            className="thanks-card"
            onAnimationEnd={(e) => {
              if (e.animationName.includes("thanks-toast")) {
                setThanksShow(false);
              }
            }}
          >
            Thank you for your feedback — it helps us improve the project.
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
          >
            <h2 id="feedback-modal-title" className="modal-title">
              Add feedback
            </h2>
            <form className="modal-form" onSubmit={handleModalSubmit}>
              <div className="modal-label">
                Image
                <span className="field-hint image-privacy-hint">
                  For internal review only — not shown on the clouds.
                </span>
                <label className="modal-upload-shell">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="modal-file-native"
                    disabled={isSubmitting}
                    onChange={(e) => onPickImage(e.target.files)}
                  />
                  <span className="modal-upload-inner">
                    {imageName ? (
                      <span className="modal-upload-filename">{imageName}</span>
                    ) : (
                      <span className="modal-upload-placeholder">
                        Tap or click here to choose an image (optional)
                      </span>
                    )}
                  </span>
                </label>
                {imageName ? (
                  <button
                    type="button"
                    className="modal-upload-clear"
                    onClick={() => {
                      setImageDataUrl(null);
                      setImageName(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    Remove image
                  </button>
                ) : null}
              </div>
              <label className="modal-label">
                Tags
                <span className="field-hint">
                  A few short phrases that capture your first impression.
                </span>
                <input
                  className="modal-input"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. polished, confusing, want to try more"
                  disabled={isSubmitting}
                />
              </label>
              <label className="modal-label">
                Reflection
                <textarea
                  className="modal-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your overall impression or anything we could improve."
                  maxLength={500}
                  rows={4}
                  required
                  disabled={isSubmitting}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn secondary"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn primary"
                  disabled={isSubmitting || !comment.trim() || !tagsValid}
                >
                  {isSubmitting ? "Sending..." : "Confirm upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
