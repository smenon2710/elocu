import { NextRequest, NextResponse } from "next/server";
import { getApiUserId, unauthorizedResponse } from "@/lib/auth";
import { getFeedback } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await getApiUserId();
  if (!userId) return unauthorizedResponse();
  const feedback = await getFeedback(userId, id);
  if (!feedback) {
    return NextResponse.json({ error: "feedback not found" }, { status: 404 });
  }
  return NextResponse.json({ feedback });
}
