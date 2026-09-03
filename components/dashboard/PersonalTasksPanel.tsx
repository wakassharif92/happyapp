"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PersonalTask, PersonalTaskStatus } from "@/lib/types/database";
import type { Project } from "@/lib/board/types";
import {
  createPersonalTask,
  deletePersonalTask,
  reorderPersonalTasks,
  rolloverOverdueTasks,
  updatePersonalTaskStatus,
} from "@/app/dashboard/tasksActions";
import { IconArrowDown, IconArrowUp } from "./icons";

// Client-only id prefix for a task that's been added locally but hasn't
// come back from the server yet — used to dim the row and hold off
// reorder/status/delete until it has a real id + sort_order to act on.
const TEMP_ID_PREFIX = "temp-";

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

function formatTaskDate(dateKey: string, today: string): string {
  if (dateKey === today) return "Today";
  if (dateKey === addDays(today, -1)) return "Yesterday";
  if (dateKey === addDays(today, 1)) return "Tomorrow";
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// Two stacked sections — Pending (anything not yet marked Done) on top,
// Done below — rather than the single-day view this used to be, and
// rather than tabs (tried first, but switching away hides the other
// list, which felt worse here than just always showing both). A task
// carries its date as a label on the row instead of being the thing
// that scopes the list, since a task that rolls over (see
// rolloverOverdueTasks) or is deliberately scheduled ahead no longer
// lines up with "the selected day" as a concept. Private per-member
// (RLS: user_id = auth.uid()), company-wide (not scoped to whichever
// project is currently selected), with an optional per-task project tag
// like NotesPanel.tsx.
export function PersonalTasksPanel({ projects }: { projects: Project[] }) {
  const today = toDateKey(new Date());
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [title, setTitle] = useState("");
  const [composerProjectId, setComposerProjectId] = useState("");
  const [composerDate, setComposerDate] = useState(today);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    // Pull forward anything still pending from an earlier day before
    // loading the list, so a task that was never finished shows up under
    // "today" instead of quietly staying stuck on a date that's passed.
    // Computed fresh here (not the outer `today`) so this effect has no
    // reactive dependency and only ever runs once, on mount.
    rolloverOverdueTasks(toDateKey(new Date())).then(() => {
      if (cancelled) return;
      supabase
        .from("personal_tasks")
        .select("*")
        .order("task_date", { ascending: true })
        .order("sort_order", { ascending: true })
        .then(({ data }) => {
          if (!cancelled) setTasks(data ?? []);
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Appends a local placeholder task immediately, before the server round
  // trip even starts — that's the whole fix for "adding takes time to
  // show up": the row was previously only added once createPersonalTask
  // resolved. Reconciled with the real row (real id + sort_order) once
  // the server responds; rolled back on failure.
  async function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const tempId = `${TEMP_ID_PREFIX}${crypto.randomUUID()}`;
    const optimisticTask: PersonalTask = {
      id: tempId,
      company_id: "",
      user_id: "",
      project_id: composerProjectId || null,
      task_date: composerDate,
      title: trimmed,
      status: "pending",
      sort_order: Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, optimisticTask]);
    setTitle("");
    try {
      const created = await createPersonalTask({
        title: trimmed,
        taskDate: composerDate,
        projectId: composerProjectId || null,
      });
      setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setTitle(trimmed);
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

  const pendingTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  // Swaps the task's sort_order with its neighbor within whichever list
  // (Pending or Done) it's in — same mechanism as DashboardClient.tsx's
  // handleReorder for issues. No-ops on a still-optimistic (temp id) row
  // on either side, since it has no real sort_order to swap yet.
  function handleReorder(list: PersonalTask[], id: string, direction: "up" | "down") {
    const idx = list.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx];
    const b = list[swapIdx];
    // Only swap within the same day — the list is sorted by date first,
    // so a sort_order swap across two different dates would get
    // immediately undone by that ordering anyway (and reordering "today"
    // against "tomorrow" isn't a meaningful priority swap).
    if (a.id.startsWith(TEMP_ID_PREFIX) || b.id.startsWith(TEMP_ID_PREFIX)) return;
    if (a.task_date !== b.task_date) return;
    setTasks((prev) =>
      prev
        .map((t) => {
          if (t.id === a.id) return { ...t, sort_order: b.sort_order };
          if (t.id === b.id) return { ...t, sort_order: a.sort_order };
          return t;
        })
        .sort(
          (x, y) => x.task_date.localeCompare(y.task_date) || x.sort_order - y.sort_order
        )
    );
    reorderPersonalTasks(a.id, b.sort_order, b.id, a.sort_order);
  }

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;

  function renderTaskRow(task: PersonalTask, index: number, list: PersonalTask[]) {
    const isPending = task.id.startsWith(TEMP_ID_PREFIX);
    return (
      <div
        key={task.id}
        className={`card flex items-center gap-3 p-3.5 ${isPending ? "opacity-60" : ""}`}
      >
        <div className="flex shrink-0 flex-col items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={() => handleReorder(list, task.id, "up")}
            disabled={isPending || index === 0 || list[index - 1].task_date !== task.task_date}
            title="Move up in priority"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            <IconArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleReorder(list, task.id, "down")}
            disabled={
              isPending || index === list.length - 1 || list[index + 1].task_date !== task.task_date
            }
            title="Move down in priority"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            <IconArrowDown className="h-4 w-4" />
          </button>
        </div>
        <span className="w-5 shrink-0 text-right text-sm font-medium text-slate-400 tabular-nums">
          {index + 1}.
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <span>{formatTaskDate(task.task_date, today)}</span>
            {task.project_id && (
              <>
                <span>·</span>
                <span>{projectName(task.project_id)}</span>
              </>
            )}
          </p>
        </div>
        <select
          value={task.status}
          disabled={isPending}
          onChange={(e) => handleStatusChange(task.id, e.target.value as PersonalTaskStatus)}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
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
          disabled={isPending}
          className="shrink-0 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add a task…"
            className="input min-w-[160px] flex-1"
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
            disabled={!title.trim()}
            className="btn-primary shrink-0"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuickDayButton
            label="Today"
            active={composerDate === today}
            onClick={() => setComposerDate(today)}
          />
          <QuickDayButton
            label="Tomorrow"
            active={composerDate === addDays(today, 1)}
            onClick={() => setComposerDate(addDays(today, 1))}
          />
          <input
            type="date"
            value={composerDate}
            onChange={(e) => setComposerDate(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Pending <span className="font-normal text-slate-400">({pendingTasks.length})</span>
        </h3>
        {pendingTasks.length === 0 ? (
          <p className="text-sm text-slate-400">No pending tasks.</p>
        ) : (
          pendingTasks.map((task, index) => renderTaskRow(task, index, pendingTasks))
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Done <span className="font-normal text-slate-400">({doneTasks.length})</span>
        </h3>
        {doneTasks.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing done yet.</p>
        ) : (
          doneTasks.map((task, index) => renderTaskRow(task, index, doneTasks))
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
