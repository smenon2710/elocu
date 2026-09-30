import { NextRequest, NextResponse } from "next/server";
import { getApiUserId, unauthorizedResponse } from "@/lib/auth";
import { consumeLlmQuota, rateLimitedResponse } from "@/lib/rateLimit";
import { parseObjectiveTarget } from "@/lib/objectives";
import { suggestObjectiveTargets } from "@/lib/objectiveSuggestion";
import type { ObjectiveTarget } from "@/lib/types";

// LLM-backed: a Groq timeout falling back to OpenRouter can take ~90s (two
// 45s ceilings, lib/llm.ts) — set explicitly rather than relying on the
// host's default function timeout, which varies by platform and plan.
export const maxDuration = 120;

/**
 * Standalone (not tied to an existing objective id) so it can run against
 * any title/note pair — the caller passes whatever targets already exist
 * for that goal so the suggestion never repeats one already tracked.
 */
export async function POST(req: NextRequest) {
  // No user data is read here, but it's an LLM call — signed-in only, so the
  // provider budget can't be spent by anyone who finds the endpoint.
  const userId = await getApiUserId();
  if (!userId) return unauthorizedResponse();
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const rawExisting: unknown[] = Array.isArray(body?.existingTargets) ? body.existingTargets : [];
  const existingTargets: ObjectiveTarget[] = rawExisting.map(parseObjectiveTarget).filter((t): t is ObjectiveTarget => t !== null);

  const quota = await consumeLlmQuota(userId);
  if (!quota.ok) return rateLimitedResponse(quota);
  const suggestions = await suggestObjectiveTargets(title, note, existingTargets);
  return NextResponse.json({ suggestions });
}
