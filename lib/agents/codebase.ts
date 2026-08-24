import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// REQ-101: search_codebase(query) — read-only. Uses execFile (argv array,
// no shell) so the agent-controlled query string can never be interpreted
// as shell syntax.
export async function searchCodebase(
  codebasePath: string,
  query: string
): Promise<string> {
  if (!codebasePath) {
    throw new Error("Project has no codebase_path configured.");
  }

  try {
    const { stdout } = await execFileAsync(
      "grep",
      [
        "-rn",
        "-I",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "--exclude-dir=dist",
        "--exclude-dir=build",
        "--exclude-dir=.next",
        "-m",
        "50",
        query,
        codebasePath,
      ],
      { maxBuffer: 1024 * 1024 }
    );
    return stdout.trim() || "No matches.";
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    if (e.code === 1) return "No matches."; // grep: no lines matched
    throw new Error(e.stderr || `search_codebase failed: ${String(err)}`);
  }
}
