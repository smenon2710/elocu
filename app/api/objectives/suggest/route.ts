import { NextRequest, NextResponse } from "next/server";
import { parseObjectiveTarget } from "@/lib/objectives";
import { suggestObjectiveTargets } from "@/lib/objectiveSuggestion";
import type { ObjectiveTarget } from "@/lib/types";

/**
 * Standalone (not tied to an existing objective id) so it can run against
 * any title/note pair — the caller passes whatever targets already exist
 * for that goal so the suggestion never repeats one already tracked.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const rawExisting: unknown[] = Array.isArray(body?.existingTargets) ? body.existingTargets : [];
  const existingTargets: ObjectiveTarget[] = rawExisting.map(parseObjectiveTarget).filter((t): t is ObjectiveTarget => t !== null);

  const suggestions = await suggestObjectiveTargets(title, note, existingTargets);
  return NextResponse.json({ suggestions });
}
