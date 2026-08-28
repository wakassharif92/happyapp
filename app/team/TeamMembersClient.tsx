"use client";

import { useState } from "react";
import type { CompanyMember } from "@/lib/types/database";
import { AddTeamMemberModal } from "@/components/team/AddTeamMemberModal";
import { RenewInviteModal } from "@/components/team/RenewInviteModal";
import { createTeamInvite, expireInvite, renewInvite } from "./actions";

type InviteStatus = "active" | "expired" | "invited";

function inviteStatus(m: CompanyMember): InviteStatus {
  if (m.user_id) return "active";
  if (m.invite_expires_at && new Date(m.invite_expires_at) <= new Date()) return "expired";
  return "invited";
}

const STATUS_STYLE: Record<InviteStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  invited: "bg-amber-50 text-amber-700",
  expired: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<InviteStatus, string> = {
  active: "Active",
  invited: "Invited",
  expired: "Expired",
};

export function TeamMembersClient({
  members: initialMembers,
  currentMemberId,
  isAdmin,
  inviteLinkBase,
}: {
  members: CompanyMember[];
  currentMemberId: string;
  isAdmin: boolean;
  inviteLinkBase: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [addOpen, setAddOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<CompanyMember | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleAdd(input: { name: string; role: string; isAdmin: boolean }) {
    const result = await createTeamInvite(input);
    if (!result.ok) throw new Error(result.error);
    setMembers((prev) => [
      ...prev,
      {
        id: result.memberId,
        company_id: "",
        user_id: null,
        name: input.name,
        role: input.role,
        is_admin: input.isAdmin,
        invite_token: result.token,
        invite_status: "pending",
        invite_expires_at: null,
        created_at: new Date().toISOString(),
        activated_at: null,
      },
    ]);
    setAddOpen(false);
  }

  async function handleExpire(memberId: string) {
    const result = await expireInvite(memberId);
    if (!result.ok) return;
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, invite_expires_at: new Date().toISOString() } : m
      )
    );
  }

  async function handleRenew(expiresAt: string | null) {
    if (!renewTarget) return;
    const result = await renewInvite(renewTarget.id, expiresAt);
    if (!result.ok) throw new Error(result.error);
    setMembers((prev) =>
      prev.map((m) => (m.id === renewTarget.id ? { ...m, invite_expires_at: expiresAt } : m))
    );
    setRenewTarget(null);
  }

  function copyLink(token: string, memberId: string) {
    navigator.clipboard?.writeText(`${inviteLinkBase}/${token}`).catch(() => {});
    setCopiedId(memberId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="btn-primary self-start"
        >
          Add team member
        </button>
      )}

      <div className="flex flex-col gap-3">
        {members.map((m) => {
          const status = inviteStatus(m);
          return (
            <div key={m.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {m.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name}
                    {m.id === currentMemberId && (
                      <span className="ml-1.5 text-xs text-slate-400">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {m.role}
                    {m.is_admin && <span className="ml-1.5 text-indigo-600">· Admin</span>}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
              </div>

              {status !== "active" && m.invite_token && (
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                  <input
                    readOnly
                    value={`${inviteLinkBase}/${m.invite_token}`}
                    className="input flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(m.invite_token!, m.id)}
                    className="btn-secondary shrink-0"
                  >
                    {copiedId === m.id ? "Copied!" : "Copy"}
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setRenewTarget(m)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        Renew
                      </button>
                      {status === "invited" && (
                        <button
                          type="button"
                          onClick={() => handleExpire(m.id)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          Expire now
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddTeamMemberModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />

      <RenewInviteModal
        open={renewTarget !== null}
        memberName={renewTarget?.name ?? ""}
        onClose={() => setRenewTarget(null)}
        onSubmit={handleRenew}
      />
    </div>
  );
}
