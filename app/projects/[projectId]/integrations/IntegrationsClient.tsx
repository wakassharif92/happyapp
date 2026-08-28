"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Connection = {
  id: string;
  team_name: string | null;
  channel_name: string | null;
  status: "pending_channel" | "connected" | "disconnected";
  connected_by: string | null;
  created_at: string;
} | null;

type Channel = { id: string; name: string; isPrivate: boolean };

export function IntegrationsClient({
  projectId,
  initialConnection,
}: {
  projectId: string;
  initialConnection: Connection;
}) {
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState(initialConnection);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Banner reflecting the OAuth callback's redirect (app/api/slack/
  // callback/route.ts) — read once via a lazy initializer (a plain render-
  // time computation, not an effect) since it only ever depends on the
  // URL this page loaded with.
  const [oauthResult] = useState<{ ok: boolean; message?: string } | null>(() => {
    const slack = searchParams.get("slack");
    if (slack === "connected") return { ok: true };
    if (slack === "error") return { ok: false, message: searchParams.get("message") ?? undefined };
    return null;
  });

  // Workspace is connected but has no channel yet right after OAuth — open
  // the picker immediately so "Connect" reads as one flow, not two clicks.
  // (openPicker's own setState calls happen inside its fetch .then/catch,
  // not synchronously in this effect body.)
  useEffect(() => {
    if (searchParams.get("slack") === "connected") openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openPicker() {
    setPickerOpen(true);
    setChannelsError(null);
    setChannels(null);
    try {
      const res = await fetch(`/api/slack/channels?project_id=${projectId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load channels");
      setChannels(body.channels);
    } catch (err) {
      setChannelsError(err instanceof Error ? err.message : "Failed to load channels");
    }
  }

  async function selectChannel(channel: Channel) {
    setBusy(true);
    try {
      const res = await fetch("/api/slack/select-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          channel_id: channel.id,
          channel_name: channel.name,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to select channel");
      setConnection((prev) =>
        prev
          ? { ...prev, channel_name: channel.name, status: "connected" }
          : {
              id: "",
              team_name: null,
              channel_name: channel.name,
              status: "connected",
              connected_by: null,
              created_at: new Date().toISOString(),
            }
      );
      setPickerOpen(false);
    } catch (err) {
      setChannelsError(err instanceof Error ? err.message : "Failed to select channel");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/slack/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      setConnection(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A154B] text-sm font-bold text-white">
            S
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Slack</p>
            <p className="text-xs text-slate-500">
              {connection?.status === "connected"
                ? `#${connection.channel_name} in ${connection.team_name ?? "your workspace"}`
                : connection?.status === "pending_channel"
                  ? `Connected to ${connection.team_name ?? "a workspace"} — choose a channel`
                  : "Not connected"}
            </p>
          </div>
        </div>

        {connection?.status === "connected" ? (
          <div className="flex gap-2">
            <button type="button" onClick={openPicker} className="btn-secondary" disabled={busy}>
              Change channel
            </button>
            <button type="button" onClick={disconnect} className="btn-danger" disabled={busy}>
              Disconnect
            </button>
          </div>
        ) : connection?.status === "pending_channel" ? (
          <button type="button" onClick={openPicker} className="btn-primary" disabled={busy}>
            Choose channel
          </button>
        ) : (
          <a href={`/api/slack/connect?project_id=${projectId}`} className="btn-primary">
            Connect
          </a>
        )}
      </div>

      {oauthResult && (
        <p
          className={`mt-4 text-sm ${oauthResult.ok ? "text-emerald-600" : "text-red-600"}`}
        >
          {oauthResult.ok
            ? "Workspace connected — pick a channel below to finish."
            : `Connection failed: ${oauthResult.message ?? "unknown error"}`}
        </p>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Choose a channel</h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-sm text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-3 max-h-80 overflow-y-auto">
              {channelsError && <p className="text-sm text-red-600">{channelsError}</p>}
              {!channelsError && channels === null && (
                <p className="text-sm text-slate-500">Loading channels…</p>
              )}
              {channels?.length === 0 && (
                <p className="text-sm text-slate-500">
                  No channels found — invite the bot to a channel in Slack first.
                </p>
              )}
              {channels?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectChannel(c)}
                  disabled={busy}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  #{c.name}
                  {c.isPrivate && <span className="ml-1.5 text-xs text-slate-400">(private)</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
