"use client";

import { useState } from "react";
import type { DocumentKind, DocumentRef } from "@/lib/types";

function SingleDocInput({
  kind,
  label,
  onAdd,
}: {
  kind: DocumentKind;
  label: string;
  onAdd: (ref: DocumentRef) => void;
}) {
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function commitPaste() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({ id: crypto.randomUUID(), kind, filename: "pasted text", text: trimmed });
    setText("");
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        onAdd(data.documentRef);
      }
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed p-3">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={mode === "paste" ? "font-semibold underline" : "text-gray-500"}
        >
          Paste
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={mode === "file" ? "font-semibold underline" : "text-gray-500"}
        >
          Upload
        </button>
      </div>

      {mode === "paste" ? (
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full rounded border p-2 text-sm"
            rows={3}
            placeholder={`Paste ${label.toLowerCase()} text…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            onClick={commitPaste}
            disabled={!text.trim()}
            className="rounded-full border px-3 py-1 text-xs disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <input
            type="file"
            accept=".txt,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {uploading && <p className="mt-1 text-xs text-gray-500">Processing…</p>}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function DocSlot({
  kind,
  label,
  docs,
  onChange,
}: {
  kind: DocumentKind;
  label: string;
  docs: DocumentRef[];
  onChange: (kind: DocumentKind, docs: DocumentRef[]) => void;
}) {
  const [adding, setAdding] = useState(docs.length === 0);

  function addDoc(ref: DocumentRef) {
    onChange(kind, [...docs, ref]);
    setAdding(false);
  }

  function removeDoc(id: string) {
    onChange(
      kind,
      docs.filter((d) => d.id !== id)
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs text-blue-600 underline"
          >
            + Add{docs.length > 0 ? " another" : ""}
          </button>
        )}
      </div>

      {docs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs text-gray-700"
            >
              <span className="truncate">{d.filename}</span>
              <button
                type="button"
                onClick={() => removeDoc(d.id)}
                className="ml-2 text-gray-400 hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && <SingleDocInput kind={kind} label={label} onAdd={addDoc} />}
    </div>
  );
}
