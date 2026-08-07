import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { extractText } from "@/lib/documents";
import type { DocumentKind } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;
const VALID_KINDS: DocumentKind[] = ["resume", "job_description", "question_list", "other"];

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kindRaw = form?.get("kind");
  const kind: DocumentKind = VALID_KINDS.includes(kindRaw as DocumentKind)
    ? (kindRaw as DocumentKind)
    : "other";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  try {
    const text = await extractText(file);
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't extract any text from that file" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      documentRef: {
        id: randomUUID(),
        kind,
        filename: file.name,
        text: text.slice(0, MAX_TEXT_CHARS),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process file" },
      { status: 500 }
    );
  }
}
