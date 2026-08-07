import { NextRequest, NextResponse } from "next/server";
import { getFeedback } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feedback = await getFeedback(id);
  if (!feedback) {
    return NextResponse.json({ error: "feedback not found" }, { status: 404 });
  }
  return NextResponse.json({ feedback });
}
