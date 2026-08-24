import { NextResponse } from "next/server";
import { requestStop } from "@/lib/agents/runRegistry";

// REQ-014: gracefully finish the current test case, then halt.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  requestStop(runId);
  return NextResponse.json({ ok: true });
}
