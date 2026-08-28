"use client";

import { useState } from "react";
import type { Document } from "@/lib/types/database";
import { addDocument, deleteDocument } from "./actions";

export function DocumentsClient({
  projectId,
  documents: initialDocuments,
  isAdmin,
}: {
  projectId: string;
  documents: Document[];
  isAdmin: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("url", url.trim());
    const result = await addDocument(projectId, undefined, formData);
    setSubmitting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDocuments((prev) => [
      {
        id: crypto.randomUUID(),
        company_id: "",
        project_id: projectId,
        name: name.trim(),
        url: url.trim(),
        created_by: "You",
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setName("");
    setUrl("");
  }

  async function handleDelete(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    await deleteDocument(projectId, id);
  }

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
        <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-4">
          <p className="text-sm font-medium text-slate-900">Add a document link</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Document name"
            className="input"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="input"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim() || !url.trim()}
            className="btn-primary self-start"
          >
            {submitting ? "Adding…" : "Add document"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {documents.length === 0 ? (
          <p className="text-sm text-slate-400">No documents yet.</p>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className="card flex items-center justify-between gap-3 p-3.5"
            >
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm font-medium text-indigo-600 hover:underline">
                  {doc.name}
                </p>
                <p className="truncate text-xs text-slate-400">{doc.url}</p>
              </a>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
