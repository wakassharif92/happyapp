// REQ-062: pick the right build/lint/test commands from the project's
// framework. Also used to validate run_command calls (REQ-102) — the agent
// can only run commands from this allowlist, plus a fixed set of read-only
// git commands and `git commit`.
export const FRAMEWORK_COMMANDS: Record<string, { command: string; args: string[] }[]> = {
  flutter: [
    { command: "flutter", args: ["analyze"] },
    { command: "flutter", args: ["test"] },
  ],
  react_native: [
    { command: "npm", args: ["run", "lint"] },
    { command: "npm", args: ["test"] },
  ],
  react: [
    { command: "npm", args: ["run", "lint"] },
    { command: "npm", args: ["run", "build"] },
  ],
  nextjs: [
    { command: "npm", args: ["run", "lint"] },
    { command: "npm", args: ["run", "build"] },
  ],
  vue: [
    { command: "npm", args: ["run", "lint"] },
    { command: "npm", args: ["run", "build"] },
  ],
  native: [],
};

const ALWAYS_ALLOWED_BINARIES = new Set(["npm", "yarn", "pnpm", "flutter"]);
const ALLOWED_GIT_SUBCOMMANDS = new Set(["status", "diff", "add", "commit", "log"]);

export function isAllowedCommand(command: string, args: string[]): boolean {
  if (command === "git") {
    return args.length > 0 && ALLOWED_GIT_SUBCOMMANDS.has(args[0]);
  }
  return ALWAYS_ALLOWED_BINARIES.has(command);
}
