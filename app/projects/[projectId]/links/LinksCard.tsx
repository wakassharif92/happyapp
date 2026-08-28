"use client";

import { useState } from "react";

function CopyRow({ label, hint, value }: { label: string; hint: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-slate-900">{label}</p>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-xs" />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="btn-secondary shrink-0"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// Section 14: the two shareable per-project links — their own dedicated
// page (separate from /integrations, which stays reachable but isn't
// linked from the sidebar) so they're always easy to find and copy.
export function LinksCard({
  supportLinkBase,
  reportLink,
}: {
  supportLinkBase: string;
  reportLink: string;
}) {
  return (
    <div className="card flex flex-col gap-5 p-6">
      <div>
        <p className="text-sm font-medium text-slate-900">Project Links</p>
        <p className="text-xs text-slate-500">
          Shareable, no-login links for this project.
        </p>
      </div>

      <CopyRow
        label="Customer Support"
        hint="Open this from your mobile app with the customer's email appended as ?email=<their email> — e.g. tapping a 'Support' button after they're logged in."
        value={`${supportLinkBase}?email=`}
      />

      <CopyRow
        label="Internal Team"
        hint="Share this with your team as-is — anyone with the link can report an issue, no login needed."
        value={reportLink}
      />
    </div>
  );
}
