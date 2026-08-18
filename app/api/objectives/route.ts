import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { parseObjectiveTarget } from "@/lib/objectives";
import { listObjectives, saveObjective } from "@/lib/store";
import { LOCAL_USER_ID, type Objective, type ObjectiveTarget } from "@/lib/types";

export async function GET() {
  const objectives = await listObjectives();
  return NextResponse.json({ objectives });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  // The creation form sends at most one initial target (or none, for a pure
  // free-text aspiration) — more can be added later from the goal's card.
  const rawTargets: unknown[] = Array.isArray(body?.targets) ? body.targets : [];
  const targets: (ObjectiveTarget | null)[] = rawTargets.map(parseObjectiveTarget);
  if (rawTargets.length > 0 && targets.some((t) => t === null)) {
    return NextResponse.json({ error: "invalid target" }, { status: 400 });
  }

  const objective: Objective = {
    id: randomUUID(),
    userId: LOCAL_USER_ID,
    createdAt: Date.now(),
    title,
    note,
    targets: targets.filter((t): t is ObjectiveTarget => t !== null),
  };

  await saveObjective(objective);
  return NextResponse.json({ objective });
}
