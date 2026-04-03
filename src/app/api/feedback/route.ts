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
    const payload = (await request.json()) as { text?: string };
    const text = payload.text ?? "";
    const item = await appendFeedback(text);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes("empty") || message.includes("long") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
