"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { IconChat } from "./icons";

// Section 14/16: red dot on the Support nav item when this project has any
// conversation whose latest message is from a customer OR a dev (a dev's
// question also needs the agent's attention) and postdates last_read_at —
// self-contained (fetch + live subscribe) so Sidebar.tsx stays a plain
// presentational component.
export function SupportNavLink({ projectId }: { projectId: string }) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function checkUnread() {
      const { data: conversations } = await supabase
        .from("support_conversations")
        .select("id, last_read_at")
        .eq("project_id", projectId);
      if (cancelled) return;
      if (!conversations || conversations.length === 0) {
        setHasUnread(false);
        return;
      }

      const { data: messages } = await supabase
        .from("support_messages")
        .select("conversation_id, created_at")
        .in(
          "conversation_id",
          conversations.map((c) => c.id)
        )
        .in("sender_type", ["customer", "dev"])
        .order("created_at", { ascending: false });
      if (cancelled) return;

      const lastReadByConversation = new Map(conversations.map((c) => [c.id, c.last_read_at]));
      const seen = new Set<string>();
      let unread = false;
      for (const m of messages ?? []) {
        if (seen.has(m.conversation_id)) continue; // only the latest per conversation matters
        seen.add(m.conversation_id);
        const lastRead = lastReadByConversation.get(m.conversation_id);
        if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
          unread = true;
          break;
        }
      }
      setHasUnread(unread);
    }

    checkUnread();

    // No server-side `filter:` — see app/projects/[projectId]/support/
    // SupportInboxClient.tsx for why (a filter on this exact table/column
    // shape silently drops events despite reporting "SUBSCRIBED").
    const channel = supabase
      .channel(`support-unread-${projectId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        () => checkUnread()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_conversations" },
        () => checkUnread()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return (
    <Link
      href={`/projects/${projectId}/support`}
      title="Support"
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--db-fg-muted)] transition-colors hover:bg-[var(--db-surface-hover)] hover:text-[var(--db-fg)]"
    >
      <span className="relative flex shrink-0">
        <IconChat className="h-4 w-4" />
        {hasUnread && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[var(--db-surface)]" />
        )}
      </span>
      <span className="hidden lg:inline">Support</span>
      {hasUnread && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-red-500 lg:inline" />}
    </Link>
  );
}
