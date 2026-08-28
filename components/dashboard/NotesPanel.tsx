"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/lib/types/database";
import type { Project } from "@/lib/board/types";
import { createNote, deleteNote } from "@/app/dashboard/notesActions";

// Company-wide and private to the signed-in member (RLS: user_id =
// auth.uid(), not is_staff() company-wide sharing like every other panel
// in this app) — not filtered by whichever project is currently selected
// in the sidebar. The project dropdown here is just an optional per-note
// tag + filter, not a data-scoping boundary the way projectId is for
// FeaturesPanel/DocumentsClient.
export function NotesPanel({ projects }: { projects: Project[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [composerProjectId, setComposerProjectId] = useState<string>("");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setNotes(data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const created = await createNote({
        text: text.trim(),
        projectId: composerProjectId || null,
      });
      setNotes((prev) => [created, ...prev]);
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await deleteNote(id);
  }

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;
  const visibleNotes = notes.filter(
    (n) => filterProjectId === "all" || n.project_id === filterProjectId
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-2 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write a note…"
          className="input"
        />
        <div className="flex items-center gap-2">
          <select
            value={composerProjectId}
            onChange={(e) => setComposerProjectId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || !text.trim()}
            className="btn-primary ml-auto"
          >
            {submitting ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Filter:</span>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        {visibleNotes.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          visibleNotes.map((note) => (
            <div key={note.id} className="card flex flex-col gap-1.5 p-3.5">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{note.text}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {projectName(note.project_id) ?? "No project"} ·{" "}
                  {new Date(note.created_at).toLocaleString()}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
