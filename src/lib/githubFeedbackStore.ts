import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FeedbackItem } from "@/types/feedback";

const DEFAULT_FILE_PATH = "web-feedback-data/feedback.json";
const MAX_ITEMS = 20;

type RepoFileResponse = {
  sha: string;
  content: string;
};

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

function getLocalFilePath() {
  const filePath = process.env.FEEDBACK_FILE_PATH || DEFAULT_FILE_PATH;
  return path.join(process.cwd(), filePath);
}

async function readLocalList(): Promise<FeedbackItem[]> {
  const localPath = getLocalFilePath();
  try {
    const content = await readFile(localPath, "utf8");
    const parsed = JSON.parse(content) as FeedbackItem[];
    return parsed
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, MAX_ITEMS);
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
  if (!hasGithubConfig()) {
    return readLocalList();
  }

  const { owner, repo, branch, filePath } = getRepoConfig();
  const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
  const response = await githubRequest(path, { method: "GET" });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  const file = (await response.json()) as RepoFileResponse;
  const parsed = JSON.parse(decodeContent(file.content)) as FeedbackItem[];
  return parsed
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_ITEMS);
}

async function readRawFile(): Promise<{ sha?: string; list: FeedbackItem[] }> {
  const { owner, repo, branch, filePath } = getRepoConfig();
  const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
  const response = await githubRequest(path, { method: "GET" });

  if (response.status === 404) {
    return { list: [] };
  }
  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  const file = (await response.json()) as RepoFileResponse;
  const parsed = JSON.parse(decodeContent(file.content)) as FeedbackItem[];
  return { sha: file.sha, list: parsed };
}

export async function appendFeedback(text: string): Promise<FeedbackItem> {
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error("Feedback cannot be empty.");
  }
  if (cleaned.length > 300) {
    throw new Error("Feedback is too long.");
  }

  const newItem: FeedbackItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: cleaned,
    createdAt: new Date().toISOString(),
  };

  if (!hasGithubConfig()) {
    const list = await readLocalList();
    const nextLocalList = [newItem, ...list]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, MAX_ITEMS);
    await writeLocalList(nextLocalList);
    return newItem;
  }

  const { owner, repo, branch, filePath } = getRepoConfig();
  const { sha, list } = await readRawFile();

  const nextList = [newItem, ...list]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_ITEMS);

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
