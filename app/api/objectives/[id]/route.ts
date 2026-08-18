import { NextRequest, NextResponse } from "next/server";
import { parseObjectiveTarget } from "@/lib/objectives";
import { deleteObjective, getObjective, saveObjective } from "@/lib/store";

/**
 * Replaces the objective's entire `targets` array in one call — covers add,
 * edit, and remove alike, since the client always sends the full list it
 * wants (matching lib/store.ts's existing whole-file-overwrite pattern for
 * sessions/feedback, rather than adding separate add/edit/remove routes).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const objective = await getObjective(id);
  if (!objective) {
    return NextResponse.json({ error: "objective not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.targets)) {
    return NextResponse.json({ error: "targets array is required" }, { status: 400 });
  }

  const targets = body.targets.map(parseObjectiveTarget);
  if (targets.some((t: unknown) => t === null)) {
    return NextResponse.json({ error: "invalid target" }, { status: 400 });
  }

  const updated = { ...objective, targets };
  await saveObjective(updated);
  return NextResponse.json({ objective: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteObjective(id);
  return NextResponse.json({ ok: true });
}
