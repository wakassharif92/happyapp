"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PersonalTask, PersonalTaskStatus } from "@/lib/types/database";
import type { Project } from "@/lib/board/types";
import {
  createPersonalTask,
  deletePersonalTask,
  updatePersonalTaskStatus,
} from "@/app/dashboard/tasksActions";

const STATUS_LABELS: Record<PersonalTaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_ORDER: PersonalTaskStatus[] = ["pending", "in_progress", "done"];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

// Day-wise personal task list — private per-member (RLS: user_id =
// auth.uid()), company-wide (not scoped to whichever project is
// currently selected), with an optional per-task project tag like
// NotesPanel.tsx.
export function PersonalTasksPanel({ projects }: { projects: Project[] }) {
  const today = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [title, setTitle] = useState("");
  const [composerProjectId, setComposerProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("personal_tasks")
      .select("*")
      .eq("task_date", selectedDate)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setTasks(data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  async function handleAdd() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const created = await createPersonalTask({
        title: title.trim(),
        taskDate: selectedDate,
        projectId: composerProjectId || null,
      });
      setTasks((prev) => [...prev, created]);
      setTitle("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: PersonalTaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    await updatePersonalTaskStatus(id, status);
  }

  async function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await deletePersonalTask(id);
  }

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <QuickDayButton
          label="Yesterday"
          active={selectedDate === addDays(today, -1)}
          onClick={() => setSelectedDate(addDays(today, -1))}
        />
        <QuickDayButton label="Today" active={selectedDate === today} onClick={() => setSelectedDate(today)} />
        <QuickDayButton
          label="Tomorrow"
          active={selectedDate === addDays(today, 1)}
          onClick={() => setSelectedDate(addDays(today, 1))}
        />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
        />
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add a task for this day…"
            className="input flex-1"
          />
          <select
            value={composerProjectId}
            onChange={(e) => setComposerProjectId(e.target.value)}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
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
            disabled={submitting || !title.trim()}
            className="btn-primary shrink-0"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks for this day.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="card flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                {task.project_id && (
                  <p className="text-xs text-slate-400">{projectName(task.project_id)}</p>
                )}
              </div>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task.id, e.target.value as PersonalTaskStatus)}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleDelete(task.id)}
                className="shrink-0 text-xs text-slate-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function QuickDayButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-slate-300 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
