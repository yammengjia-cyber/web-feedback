import { NextRequest, NextResponse } from "next/server";
import { appendFeedback, getFeedbackList } from "@/lib/githubFeedbackStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await getFeedbackList();
    return NextResponse.json({ items: list });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load feedback.", detail: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      tags?: string[];
      tag?: string;
      comment?: string;
      imageDataUrl?: string;
    };
    const item = await appendFeedback({
      tags: payload.tags,
      tag: payload.tag,
      comment: payload.comment ?? "",
      imageDataUrl: payload.imageDataUrl,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    const isClientError =
      message.includes("required") ||
      message.includes("too long") ||
      message.includes("too large") ||
      message.includes("Image must");
    const status = isClientError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
