import { randomUUID } from "crypto";
import type { DocumentKind, DocumentRef } from "./types";

export const MAX_DOC_TEXT_CHARS = 20000;
export const VALID_DOC_KINDS: DocumentKind[] = ["resume", "job_description", "question_list", "other"];
// Every doc is resent in the persona prompt on every turn (lib/persona.ts), so
// the count needs a ceiling too, not just each doc's length.
const MAX_DOCS_PER_SESSION = 10;
const MAX_FILENAME_CHARS = 200;

/**
 * Session creation takes documentRefs from the client as-is — pasted text is
 * built client-side (app/components/DocSlot.tsx) and never passes through
 * /api/documents' cap, and any direct API call could send anything. This is
 * the one server-side gate: same per-doc cap as uploads, a doc-count cap,
 * valid kinds only, empty docs dropped.
 */
export function sanitizeDocumentRefs(raw: unknown): DocumentRef[] {
  if (!Array.isArray(raw)) return [];
  const refs: DocumentRef[] = [];
  for (const item of raw) {
    if (refs.length >= MAX_DOCS_PER_SESSION) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const text = typeof r.text === "string" ? stripNul(r.text).trim().slice(0, MAX_DOC_TEXT_CHARS) : "";
    if (!text) continue;
    refs.push({
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 64) : randomUUID(),
      kind: VALID_DOC_KINDS.includes(r.kind as DocumentKind) ? (r.kind as DocumentKind) : "other",
      filename: typeof r.filename === "string" && r.filename ? stripNul(r.filename).slice(0, MAX_FILENAME_CHARS) : "document",
      text,
    });
  }
  return refs;
}

export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }

  // Anything else is only accepted if it's actually text. A .docx (a zip)
  // or other binary decoded as UTF-8 is garbage to the model — and its NUL
  // bytes can't be stored in Postgres at all. NUL never appears in real text,
  // so it's a reliable binary tell.
  if (buffer.includes(0)) {
    throw new UnsupportedDocumentError("That file type isn't supported — upload a PDF or .txt file, or paste the text instead.");
  }
  return buffer.toString("utf-8").trim();
}

export class UnsupportedDocumentError extends Error {}

/** Postgres text/JSONB can't hold U+0000 — strip it from anything user-supplied before it's stored. */
export function stripNul(text: string): string {
  return text.replace(/\u0000/g, "");
}
