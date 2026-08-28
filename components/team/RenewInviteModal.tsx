"use client";

import { useState } from "react";
import { IconClose } from "@/components/dashboard/icons";

// Part D: sets a NEW expiry on the SAME invite token — the link itself
// never changes, only invite_expires_at. Also used implicitly by
// TeamMembersClient.tsx as the "set an expiry" flow right after Add, since
// createTeamInvite() itself doesn't collect one (matches the fields the
// user actually asked the Add modal to have: name, role, detail — expiry
// is a separate, later admin action).
export function RenewInviteModal({
  open,
  memberName,
  onClose,
  onSubmit,
}: {
  open: boolean;
  memberName: string;
  onClose: () => void;
  onSubmit: (expiresAt: string | null) => Promise<void>;
}) {
  const [neverExpires, setNeverExpires] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const iso = neverExpires ? null : expiresAt ? new Date(expiresAt).toISOString() : null;
      await onSubmit(iso);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to renew invite");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Renew invite</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {memberName} — the link itself stays the same, only its expiry changes.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={neverExpires}
              onChange={(e) => setNeverExpires(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Never expires
          </label>

          {!neverExpires && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Expires at</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="input"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (!neverExpires && !expiresAt)}
            className="btn-primary mt-1"
          >
            {submitting ? "Renewing…" : "Renew link"}
          </button>
        </div>
      </div>
    </div>
  );
}
