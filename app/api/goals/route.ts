import { NextRequest, NextResponse } from "next/server";
import { getApiUserId, unauthorizedResponse } from "@/lib/auth";
import { listGoalLabels } from "@/lib/store";
import type { SessionMode } from "@/lib/types";

const VALID_MODES: SessionMode[] = ["interview", "conversation", "speech", "orator", "debate", "pitch"];

/** Powers the mode selector's "keep practicing this?" picker — distinct goal labels used in a given mode, most recently used first. */
export async function GET(req: NextRequest) {
  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode = VALID_MODES.includes(modeParam as SessionMode) ? (modeParam as SessionMode) : undefined;
  const userId = await getApiUserId();
  if (!userId) return unauthorizedResponse();
  const goals = await listGoalLabels(userId, mode);
  return NextResponse.json({ goals });
}
