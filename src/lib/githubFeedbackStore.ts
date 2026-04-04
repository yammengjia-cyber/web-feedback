import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { normalizeFeedbackList } from "@/lib/normalizeFeedback";
import { parseTagsFromPayload } from "@/lib/parseTags";
import {
  FEEDBACK_DISPLAY_LIMIT,
  FEEDBACK_MAX_STORED_DEFAULT,
} from "@/constants/feedbackLimits";
import { FeedbackItem } from "@/types/feedback";

const DEFAULT_FILE_PATH = "web-feedback-data/feedback.json";

function maxStoredCount(): number {
  const raw = process.env.FEEDBACK_MAX_STORED;
  if (raw === undefined || raw === "") return FEEDBACK_MAX_STORED_DEFAULT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= FEEDBACK_DISPLAY_LIMIT
    ? n
    : FEEDBACK_MAX_STORED_DEFAULT;
}

const MAX_COMMENT_LEN = 500;
/** Base64 data URL 字符上限（约对应 2.5–2.8MB 原图）；受 Vercel 等请求体 ~4.5MB 限制 */
const MAX_IMAGE_DATA_URL_CHARS = 3_800_000;

type RepoFileResponse = {
  sha: string;
  content?: string;
  size?: number;
  message?: string;
  download_url?: string | null;
};

function parseGithubContentsJson(text: string, responseStatus: number): RepoFileResponse {
  if (responseStatus === 404) {
    throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" as const });
  }
  let file: RepoFileResponse;
  try {
    file = JSON.parse(text) as RepoFileResponse;
  } catch {
    throw new Error("GitHub returned invalid JSON for the file request.");
  }
  if (!responseStatus.toString().startsWith("2")) {
    const msg = file.message?.trim();
    throw new Error(
      msg
        ? `GitHub API (${responseStatus}): ${msg}`
        : `GitHub API error: ${responseStatus}`,
    );
  }
  return file;
}

async function loadFeedbackArrayFromRepoFile(
  file: RepoFileResponse,
): Promise<FeedbackItem[]> {
  let jsonText: string;
  if (file.content && typeof file.content === "string") {
    jsonText = decodeContent(file.content);
  } else if (file.download_url) {
    const response = await fetch(file.download_url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not download feedback.json from GitHub raw URL (${response.status}).`);
    }
    jsonText = await response.text();
  } else {
    const sizeHint =
      typeof file.size === "number" ? ` (reported size ${file.size} bytes)` : "";
    throw new Error(
      `feedback.json is too large for GitHub's Contents API (max ~1 MB per response)${sizeHint}. ` +
        `Please move images out of JSON (Blob), lower FEEDBACK_MAX_STORED, or remove old "imageDataUrl" fields.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      "Could not parse feedback.json in the repo (invalid JSON).",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("feedback.json in the repo must be a JSON array.");
  }
  return normalizeFeedbackList(parsed as FeedbackItem[]);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function getRepoConfig() {
  const owner = getRequiredEnv("GITHUB_REPO_OWNER");
  const repo = getRequiredEnv("GITHUB_REPO_NAME");
  const token = getRequiredEnv("GITHUB_TOKEN");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";
  const filePath = process.env.FEEDBACK_FILE_PATH || DEFAULT_FILE_PATH;
  return { owner, repo, token, branch, filePath };
}

function hasGithubConfig() {
  return Boolean(
    process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME &&
      process.env.GITHUB_TOKEN,
  );
}

function hasBlobConfig() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Vercel production/preview runs on a read-only filesystem. Local JSON writes
 * throw EROFS unless we use the GitHub API.
 */
function isVercelReadonlyRuntime() {
  if (process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "development") {
    return true;
  }
  // Some runtimes omit VERCEL; serverless deploy cwd is read-only on Vercel.
  try {
    return process.cwd().includes("/var/task");
  } catch {
    return false;
  }
}

const MISSING_GITHUB_ON_VERCEL_MSG =
  "Server storage is not configured. In Vercel → Project → Settings → Environment Variables, add GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME (and optionally GITHUB_REPO_BRANCH, FEEDBACK_FILE_PATH), then redeploy.";
const MISSING_BLOB_MSG =
  "Image storage is not configured. In Vercel → Storage, create/connect Blob, then redeploy so BLOB_READ_WRITE_TOKEN is available.";

function assertCanPersistWithoutGithub() {
  if (isVercelReadonlyRuntime()) {
    throw new Error(MISSING_GITHUB_ON_VERCEL_MSG);
  }
}

function getLocalFilePath() {
  const filePath = process.env.FEEDBACK_FILE_PATH || DEFAULT_FILE_PATH;
  return path.join(process.cwd(), filePath);
}

async function readLocalListFull(): Promise<FeedbackItem[]> {
  const localPath = getLocalFilePath();
  try {
    const content = await readFile(localPath, "utf8");
    const parsed = JSON.parse(content) as FeedbackItem[];
    return normalizeFeedbackList(parsed).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  } catch {
    return [];
  }
}

async function writeLocalList(list: FeedbackItem[]) {
  const localPath = getLocalFilePath();
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, JSON.stringify(list, null, 2), "utf8");
}

async function githubRequest(path: string, init: RequestInit = {}) {
  const { token } = getRepoConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  return response;
}

function decodeContent(base64Content: string): string {
  return Buffer.from(base64Content, "base64").toString("utf8");
}

function encodeContent(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

export async function getFeedbackList(): Promise<FeedbackItem[]> {
  let full: FeedbackItem[];
  if (!hasGithubConfig()) {
    if (isVercelReadonlyRuntime()) {
      return [];
    }
    full = await readLocalListFull();
  } else {
    const { owner, repo, branch, filePath } = getRepoConfig();
    const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
    const response = await githubRequest(path, { method: "GET" });
    const text = await response.text();

    let file: RepoFileResponse;
    try {
      file = parseGithubContentsJson(text, response.status);
    } catch (e) {
      if (e instanceof Error && (e as Error & { code?: string }).code === "NOT_FOUND") {
        return [];
      }
      throw e;
    }

    full = (await loadFeedbackArrayFromRepoFile(file)).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  return full.slice(0, FEEDBACK_DISPLAY_LIMIT);
}

async function readRawFile(): Promise<{ sha?: string; list: FeedbackItem[] }> {
  const { owner, repo, branch, filePath } = getRepoConfig();
  const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
  const response = await githubRequest(path, { method: "GET" });
  const text = await response.text();

  let file: RepoFileResponse;
  try {
    file = parseGithubContentsJson(text, response.status);
  } catch (e) {
    if (e instanceof Error && (e as Error & { code?: string }).code === "NOT_FOUND") {
      return { list: [] };
    }
    throw e;
  }

  return { sha: file.sha, list: await loadFeedbackArrayFromRepoFile(file) };
}

export type NewFeedbackInput = {
  tags?: string[];
  tag?: string;
  comment: string;
  imageDataUrl?: string;
};

function validateImageDataUrl(url: string) {
  if (
    !/^data:image\/(jpeg|jpg|png|webp|heic|heif)(-sequence)?;base64,/i.test(url)
  ) {
    throw new Error("Image must be JPEG, PNG, WebP, or HEIC/HEIF (iPhone photos).");
  }
  if (url.length > MAX_IMAGE_DATA_URL_CHARS) {
    throw new Error("Image is too large. Try a photo under about 2.8 MB.");
  }
}

function dataUrlToUploadParts(url: string) {
  const match = url.match(/^data:(image\/[a-z0-9.+-]+(?:-[a-z0-9.+-]+)?);base64,(.+)$/i);
  if (!match) {
    throw new Error("Image must be JPEG, PNG, WebP, or HEIC/HEIF (iPhone photos).");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const extension =
    mimeType === "image/jpeg" || mimeType === "image/jpg"
      ? "jpg"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType.includes("heic")
            ? "heic"
            : mimeType.includes("heif")
              ? "heif"
              : "img";

  return {
    mimeType,
    extension,
    buffer: Buffer.from(base64, "base64"),
  };
}

async function uploadImageAndGetUrl(imageDataUrl: string, feedbackId: string) {
  if (!hasBlobConfig()) {
    if (isVercelReadonlyRuntime() || hasGithubConfig()) {
      throw new Error(MISSING_BLOB_MSG);
    }
    return undefined;
  }

  const { mimeType, extension, buffer } = dataUrlToUploadParts(imageDataUrl);
  const blob = await put(`feedback-images/${feedbackId}.${extension}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: mimeType,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

export async function appendFeedback(input: NewFeedbackInput): Promise<FeedbackItem> {
  const tags = parseTagsFromPayload(input.tags, input.tag);
  const comment = input.comment.trim();
  if (tags.length === 0) {
    throw new Error("At least one tag is required.");
  }
  if (!comment) {
    throw new Error("Comment is required.");
  }
  if (comment.length > MAX_COMMENT_LEN) {
    throw new Error("Comment is too long.");
  }

  let imageDataUrl: string | undefined;
  if (input.imageDataUrl?.trim()) {
    validateImageDataUrl(input.imageDataUrl.trim());
    imageDataUrl = input.imageDataUrl.trim();
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const imageUrl = imageDataUrl ? await uploadImageAndGetUrl(imageDataUrl, id) : undefined;
  const canInlineImageLocally = Boolean(imageDataUrl && !hasBlobConfig() && !hasGithubConfig());

  const newItem: FeedbackItem = {
    id,
    tags,
    comment,
    createdAt: new Date().toISOString(),
    ...(imageUrl ? { imageUrl } : canInlineImageLocally ? { imageDataUrl } : {}),
  };

  const cap = maxStoredCount();

  if (!hasGithubConfig()) {
    assertCanPersistWithoutGithub();
    const list = await readLocalListFull();
    const nextLocalList = [newItem, ...list]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, cap);
    await writeLocalList(nextLocalList);
    return newItem;
  }

  const { owner, repo, branch, filePath } = getRepoConfig();
  const { sha, list } = await readRawFile();

  const nextList = [newItem, ...list]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, cap);

  const body = {
    message: "Update feedback list",
    content: encodeContent(JSON.stringify(nextList, null, 2)),
    branch,
    ...(sha ? { sha } : {}),
  };

  const writePath = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`;
  const response = await githubRequest(writePath, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub write failed: ${response.status} ${errorText}`);
  }

  return newItem;
}
