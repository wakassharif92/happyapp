# QA Agent — Build Progress

Tracks status against `qa-agent-spec.md`. Update this as work continues — check items off, move things between sections, add new gaps as they're found.

**Last updated:** 2026-08-06

---

## Status at a glance

| Phase | Status |
|---|---|
| 1. Schema + scaffold + auth | ✅ Done, verified |
| 2. Projects + nav shell | ✅ Done, verified |
| 3. CRUD dashboard pages | ✅ Done, verified |
| 4. Playwright bridge (web) | ✅ Done, verified |
| 5. QA Agent + Automated Testing | ✅ Done, verified |
| 6. Manual triage flow | ✅ Done, verified |
| 7. Programming Agent + fix pipeline | ✅ Done, verified |
| 8. Appium bridge (mobile) | ✅ Done, **verified against real hardware** |
| 9. Polish (realtime, counters, bridge health) | ✅ Done, verified |
| 12. Multi-provider model routing (REQ-100/104–107) | ✅ Verified (DeepSeek + Claude paths); Qwen confirmed at API level, not yet through app |

---

## What's done

### 1. Schema, scaffold, auth
- `supabase/migrations/0001_init.sql` — all 7 tables from Section 3 (REQ-000–006), RLS (`auth.uid() is not null` on everything), `evidence` storage bucket, Realtime enabled on `agent_events`/`test_runs`/`issues`. **Applied to the live Supabase project.**
- `lib/supabase/{client,server,admin}.ts` — browser/server/service-role clients.
- `lib/types/database.ts` — hand-written types (must stay `type`, not `interface` — see note below).
- Email/password auth (`app/login`), `proxy.ts` guards all routes except `/login`.

### 2. Projects + nav shell
- `/projects/new` (REQ-074), project switcher + sidebar nav (REQ-071), `/projects/[id]/settings`.
- "QA It" disabled until `automation_target` + `codebase_path` are set (guard banner in the layout).

### 3. Dashboard CRUD (no AI)
- Modules list + manual add/delete, Report Issue (with Storage screenshot upload), All Issues (filterable table), Approval Queue, Issue detail view.

### 4. Playwright bridge (REQ-092)
- `services/playwright-bridge/server.ts` — Express, one process holds multiple browser contexts keyed by session id.
- `lib/bridge/client.ts` / `lib/bridge/types.ts` — shared contract, also used by the Appium bridge.
- Verified: session create → type/click actions → aria-snapshot DOM → screenshot → close, against a real local page.

### 5. QA Agent + Automated Testing (REQ-010–014, 070, 073)
- `lib/agents/claude.ts` — generic tool-use loop (REQ-100/103, max 25 turns).
- `lib/agents/qa-agent/{generateModules,generateTestCases,runTestSuite}.ts`.
- Live activity feed (`components/ActivityFeed.tsx`, Supabase Realtime) on the module run panel.
- **Verified against real Claude API + Playwright bridge**: synced 2 modules from a requirements doc, generated 16 test cases (happy path + edge cases), ran a scenario that found a genuinely seeded bug (agent double-checked with 3 emails before filing it), and Stop correctly halted after the in-progress case rather than mid-step.

### 6. Manual triage (REQ-050–052)
- `lib/agents/qa-agent/triageIssue.ts`, single + bulk triage API routes, "Needs Triage" queue (`tag=untriaged` filter on All Issues), Approval Queue resolution.
- **Verified**: two seeded issues (one real bug, one matching documented behavior) were correctly classified `bug` / `not_a_bug` with reasoning citing the actual requirement text.
- **Bug caught and fixed during verification**: the triage prompt never told the agent the issue's actual UUID, so it hallucinated one from the title and `update_issue_tag` failed silently. Fixed by (a) including the real UUID in the prompt and (b) hardening the tool to use `ctx.runId` directly during a triage run instead of trusting the model's copy of the id.

### 7. Programming Agent + fix pipeline (REQ-060–063)
- `lib/agents/programming-agent/{tools,runFix,commands}.ts` — `read_file`/`write_file`/`run_command` (allowlisted binaries + git, no shell string parsing — uses `execFile` with argv arrays) / `log_event`, plus `search_codebase` (read-only — added beyond the literal REQ-102 list so the agent can "search further" per REQ-061's own comment).
- `lib/agents/qa-agent/verifyFix.ts` — REQ-063 re-verification.
- **Verified end-to-end on a real git repo**: seeded triaged bug → fix batch trigger → agent read the file, diagnosed the exact root cause, wrote a correct regex fix, ran lint/build, committed with a spec-formatted message referencing the issue id → QA Agent independently re-ran the repro via the browser → issue marked `verified`. Full loop, no human step in the middle.

### 8. Appium bridge (REQ-091) — ✅ verified against real hardware
- `services/appium-bridge/server.ts` — same HTTP contract as the Playwright bridge, via `webdriverio`.
- **Verified end-to-end against a real physical device** (Samsung SM-A155F, connected via USB, visible to `adb devices` — no emulator needed, one was already attached): started a real Appium server (`npx appium --port 4723`, `uiautomator2` driver installed via `npx appium driver install uiautomator2`), started the mobile bridge (`npm run bridge:appium`) pointed at it, created a real session (which launched the Sacrol app — `com.sacrol.app` — on the device), pulled a real screenshot (Sacrol's splash screen) and real page-source/accessibility-tree XML, then cleanly deleted the session. Full round trip confirmed working, not just health-check-level.
- **Fixed along the way**: `JAVA_HOME` wasn't set (only `ANDROID_HOME` was) — Appium needs it explicitly even though a bare `java -version` worked; resolved via `/usr/libexec/java_home`. `.env.local.example`'s `APPIUM_BRIDGE_URL` was dead config — grepped the codebase, confirmed zero references, removed it. `package.json`'s `bridge:appium`/`bridge:playwright` scripts didn't load `.env.local` at all (`tsx` doesn't auto-load dotenv the way Next.js does) — added `--env-file=.env.local` to both so capabilities/ports persist across restarts without manual `export`.
- **Root-caused a real user-reported bug this same session**: Sacrol's `automation_target` was pointing at `http://localhost:4001` — the *Playwright* bridge's port, not an Appium bridge — left over from before Appium was ever set up. Every "QA It" run was failing in ~130ms with `"Failed to start automation session: Error: baseUrl is required"` (the Playwright bridge rejecting a body-less mobile-style request), and since no test case ever started, there was no "running X" progress to show either — not a separate UI bug. Fixed by pointing `automation_target` at the real bridge (`http://localhost:4002`) once it existed.
- **Known gap, unchanged**: desired capabilities (`APPIUM_DEVICE_NAME`/`APPIUM_APP_PACKAGE`/`APPIUM_APP_ACTIVITY`) are still global env vars, not per-project DB fields — fine for Sacrol alone, breaks if a second mobile project needs different capabilities at the same time.

### 9. Polish
- `components/ProgressBar.tsx` on module cards, the run panel, and the dashboard (REQ-073's "progress bars, not just a status string").
- `components/BridgeStatusBadge.tsx` + `checkBridgeHealth()` — proactive "bridge connected / not reachable" indicator on the dashboard (REQ-091).
- Dashboard now shows all 5 counts from REQ-073: open bugs, needs triage, needs approval, fixed (unverified), verified.
- Full regression: clean `tsc --noEmit`, clean `eslint .`, clean `next build`, and a visual walkthrough (light + dark) of every page.

### 10. Performance fixes + light-mode theme redesign (not in the original spec)
- **Nav slowness**: `proxy.ts` switched from `supabase.auth.getUser()` (network round-trip on every request) to `getSession()`; sequential Supabase queries on Dashboard/Testing/Module detail/Issue detail parallelized via `Promise.all`; `BridgeStatusBadge` moved into a `Suspense` boundary with a shorter health-check timeout so it can't block the whole Dashboard render; `loading.tsx` skeleton added to every project sub-route for instant nav feedback.
- **Theme**: dark mode permanently disabled (`@custom-variant dark (&:where(.__qa-agent-dark-disabled))` in `app/globals.css`), new indigo/slate design-token system, `.btn-primary`/`.btn-secondary`/`.btn-danger`/`.card`/`.input` utility classes, applied across every page/component.

### 11. Per-operation API cost tracking (not in the original spec)
- New table `agent_api_calls` (`supabase/migrations/0002_agent_cost_tracking.sql`) — one row per Claude API call (i.e. per turn of `runAgentLoop`), tagged with `project_id`, `operation` (`module_sync` / `test_case_generation` / `test_run` / `issue_triage` / `fix_run` / `verify_fix`), `run_id`, token counts, and computed `cost_usd`. **Applied to the live Supabase project** (user ran it by hand via the SQL Editor, since the CLI couldn't reach this project — see history below).
- `lib/agents/pricing.ts` — per-model $/token pricing (`claude-sonnet-5`'s intro rate vs. standard rate, keyed off the 2026-08-31 cutoff date; other models static).
- `lib/agents/usageTracking.ts` — `recordApiUsage()`, called from an `onUsage(usage, model)` hook on `runAgentLoop` (`lib/agents/claude.ts`) that fires once per turn. `model` is now the actual model that answered that turn (see §12 — this stopped being a fixed constant once model routing shipped). Wired into all 6 agent call sites (`generateModules`, `generateTestCases`, `runTestSuite`, `triageIssue`, `verifyFix`, `runFix`).
- `components/CostSummary.tsx` — renders total cost + a per-operation breakdown (calls, tokens, $) on the project Dashboard.
- **Not yet verified against real usage** — `tsc`/`eslint` are clean and the table now exists in the live project, but no real agent run has been made since this was added, so the actual `agent_api_calls` rows and dashboard numbers haven't been eyeballed yet.

### 12. Multi-provider model routing (REQ-100, 104–107) — ✅ verified end-to-end (DeepSeek path)
`qa-agent-spec.md` was revised to make both agents provider-agnostic instead of Claude-only, with a task→model routing table spanning Claude, DeepSeek, and Qwen (REQ-104), and the QA Agent's screenshot/vision tool removed entirely (REQ-101/092 — this system is now text-only end to end, DOM/accessibility tree only).
- **`lib/agents/providers/`** — `types.ts` (the `ModelProvider` interface + `NormalizedContentBlock`/`ProviderRequest`/`ProviderResponse`, decoupled from `@anthropic-ai/sdk`'s own `ContentBlock`/`Usage` types since those now carry provider-specific required fields like `caller`/`service_tier` that don't exist for other providers), `anthropicProvider.ts` (thin wrapper around the existing Anthropic client), `openaiCompatibleProvider.ts` (one implementation shared by DeepSeek and Qwen — both are OpenAI-compatible chat-completions APIs — via the official `openai` npm package pointed at a custom `baseURL`; does the two-way translation between Anthropic's `Tool`/`MessageParam` shape, which stays the app's one canonical internal format, and OpenAI's request/response shape), `adapter.ts` (`callModel(task, req)` — REQ-105 — resolves the routing table and retries once against the configured fallback if the primary provider call throws).
- **`lib/agents/modelRouting.ts`** (REQ-106) — the task→{provider, model} table, each entry overridable via one env var (`MODEL_ROUTING_<TASK>=provider:model`) without touching any agent code.
- **`lib/agents/claude.ts`**'s `runAgentLoop` now takes a required `task` option and calls `callModel()` instead of the Anthropic SDK directly; `MODEL` (the old fixed constant) is gone — `onUsage(usage, model)` now reports whichever model actually answered each turn, since that varies by task (and, for `fix_run`, can differ from the routing table's primary on a fallback).
- **Two assumptions confirmed with the user** (REQ-104's table doesn't cover them): module sync (REQ-010) routes like test case generation, to DeepSeek V4 Flash. Qwen's exact model id and pricing couldn't be verified — Alibaba's DashScope docs are JS-rendered and unfetchable via WebFetch — so `fix_run` ships with a best-effort default (`qwen3-coder-plus`, international endpoint) and a placeholder cost-tracking rate, both flagged inline in `modelRouting.ts`/`pricing.ts` and correctable via env var / direct edit once confirmed. DeepSeek's model ids and pricing (`deepseek-v4-flash`/`deepseek-v4-pro`) **were** verified live against `api-docs.deepseek.com`.
- **`verifyFix.ts`** doesn't get its own routing entry — REQ-104's "same model as the original test case/issue" is resolved by reusing the `test_run` or `issue_triage` task key based on `issue.source`, rather than inventing a `verify_fix` routing key (the `agent_api_calls.operation` cost-tracking label stays `verify_fix` regardless — separate axis, unaffected).
- Clean `tsc --noEmit`, `eslint .`, and `next build`.
- **`DEEPSEEK_API_KEY` and `QWEN_API_KEY` are now in the real `.env.local`.** Both were smoke-tested with raw `curl` against the real endpoints (not yet through the app's own agent loop):
  - **Qwen — fully confirmed live**: `qwen3-coder-plus` on `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` returned a real `200` completion. The best-effort default guessed during planning was exactly right — no correction needed.
  - **Fixed a real base-URL bug found by this test**: `DEEPSEEK_BASE_URL` defaulted to `https://api.deepseek.com` (no `/v1`, per DeepSeek's own doc wording) but only `https://api.deepseek.com/v1` returns a clean, parseable response — the bare URL gave a bodyless `402`. Corrected in `.env.local`, `.env.local.example`, and the fallback default in `lib/agents/providers/adapter.ts`.
  - `issue_triage` (Claude Sonnet 5) needs no new keys and has been verified in earlier sessions.
- **Full end-to-end verification, real DeepSeek account, through the actual app (not just `curl`)**: after the user funded the DeepSeek account, ran REQ-010's "Sync modules from requirements doc" twice against the real "Sacrol" project via Playwright driving the real UI at `localhost:3000`. Both runs completed successfully (~28s each — `deepseek-v4-flash` is a reasoning model, so a 10-module structured extraction genuinely takes a while) and produced real `agent_api_calls` rows: `model: "deepseek-v4-flash"`, real token counts (e.g. 2317 input / 3266 output), real computed cost (~$0.0012/run). This is hard confirmation that the whole translation path works for real — `openaiCompatibleProvider.ts`'s Tool→function-tool request translation, the `submit_modules` tool call round-trip, JSON-args parsing, `finishTools` capture, and cost logging with the real model name all functioned correctly through a genuine multi-turn-capable loop, not just a raw chat completion.
  - **Found by this same test, not a code bug**: module dedup in `generateModules.ts` matches on exact lowercased name. DeepSeek phrased several module names differently than Claude did in the original sync (e.g. "Playlists Management" vs "Playlist Management" vs "Playlists"; "Insights" vs "Insights (Parent Analytics)"), so the two test runs added 11 near-duplicate modules to the real "Sacrol" project (10 → 21). Confirmed the 11 new ones (by `created_at`) had zero `test_cases`/`issues` attached, then deleted them — "Sacrol" is back to its original 10. The underlying gap (exact-match dedup can't survive model-phrasing drift across providers/runs) is real and still unfixed — flagged in Pending.

---

## Pending / not built

- **Dedup on module sync (REQ-010) is exact-name-only** — found during §12's verification (module count temporarily went 10 → 21 in the real "Sacrol" project before the 11 duplicates were confirmed test_case/issue-free and deleted). Not something the spec called for originally. Worth deciding whether to fuzzy-match names, or just accept it as an expected consequence of ever re-syncing modules against a different model than the one that created them.
- **Test case generation and Fix It (Qwen) are still only verified via raw `curl`, not through the app** — module sync (this session) proved the translation path works in general, but `test_case_generation`, `test_run`, and `fix_run` haven't each been individually exercised through a real UI-driven run yet. **Blocked on a real issue existing**: the "Sacrol" project currently has zero issues, so `fix_run` has nothing to run against. User is going to report/generate a real issue themselves (Report Issue form, or an automated test run) and triage it; once one exists and is `tag=bug`/`status=triaged`, trigger the Fix It batch on it to get the first real Qwen run through the app. Now that Sacrol's Appium bridge is live and `automation_target` points at it correctly, a real "QA It" run against Sacrol is also the natural way to get `test_run` its first real UI-driven verification.
- **The real Appium server + mobile bridge are running as background processes started manually this session** (`npx appium --port 4723`, `npm run bridge:appium`) — they will **not** survive a machine restart or this terminal session ending. Before testing Sacrol again after a restart: confirm the device is connected (`adb devices`), start Appium (`ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=$(/usr/libexec/java_home) npx appium --port 4723`), then `npm run bridge:appium` (now auto-loads `.env.local`, including the app package/activity — see §8).
- **No automated test suite** (unit/integration tests for the app itself). This was built and verified interactively via real Claude/Supabase/browser runs, not via a CI-style test suite. Worth adding if this goes anywhere near production.
- **Per-project Appium capabilities** — device name / app package / app activity are global env vars right now, not stored per-project. Fine for Sacrol alone; breaks if a second mobile project needs different capabilities at the same time.
- **iOS** — explicitly out of scope per spec (Section 10), but worth noting the mobile bridge is Android/UiAutomator2-only right now.
- Nothing has been committed to git yet — the working tree is clean per `git status` but all changes are uncommitted.

## Known non-obvious things (read before changing related code)

- **`lib/types/database.ts` must use `type X = {...}`, not `interface X {...}`.** With interfaces, `@supabase/postgrest-js`'s column-string inference (`.select("id")`) silently collapses to `never` for this exact dependency combination. Cost real debugging time once already — don't reintroduce interfaces there.
- **Triage/verify/fix tool calls that take an `issue_id`/similar id param should prefer `ctx.runId` over trusting the model's copy of the UUID**, per the bug found in Phase 6. The model is generally good at copying ids verbatim when given them, but don't rely on it alone when the orchestration code already knows the answer.
- **Bridge fire-and-forget runs** (`runTestSuite`, `triageIssue`, `runFix`) rely on the Next.js dev/prod server being one long-lived Node process (REQ-090's "local machine" model) — this breaks on serverless/edge deployment. Don't deploy this app to Vercel-style serverless without rearchitecting the background execution.
- **`.env.local` has real credentials** (Supabase project + Anthropic key) — it's gitignored, but don't accidentally read/log/paste its contents somewhere that leaves this machine.
- **The Supabase free-tier project can auto-pause after ~a week of no API activity.** Hit this directly (2026-08-24): every query started failing with `TypeError: fetch failed`, which first looked like the known transient DNS flake (see the coerceArrayField-era notes) — but a direct `curl` to the project URL returned a real, non-transient **Cloudflare 521 "Web server is down"**, not a DNS or timeout error. If Supabase calls start failing app-wide with no code change to explain it, check the project's status in the Supabase dashboard and resume it before debugging further — there's no API-key-based way to unpause it, only the dashboard.
- **`lib/agents/pricing.ts` hardcodes per-model $/token rates**, including a date-conditional branch for `claude-sonnet-5`'s introductory pricing (cutoff 2026-08-31) and unverified DeepSeek/Qwen entries flagged inline. If a provider changes pricing, or `lib/agents/modelRouting.ts` gets pointed at a model not in `STATIC_PRICING`, cost numbers will silently drift toward the Sonnet-5 fallback — there's no live pricing lookup. Update this file when a model or its price changes.
- **Never trust the shape of a `finishTools` result (`result.result`) without validating it.** Found in production use: for a large `submit_modules` payload (10 modules), Claude returned `modules` as a JSON-*encoded string* instead of a native array — and it was double-nested (`{"modules": "{\"modules\":[...]}"}`). `lib/agents/parseAgentResult.ts`'s `coerceArrayField()` unwraps this (string → parse → unwrap nested key → array), and every array-shaped agent result (`generateModules`, `generateTestCases`) goes through it now. Scalar fields (`status`, `resolved`, `summary`) got the same treatment as a defensive `typeof` check with a clear error message instead of a crash, though the string-encoding failure mode has only been *observed* for arrays so far. If a scalar field ever fails the same way, reuse the same unwrap-if-string pattern there too.
- **Assistant-turn message content in `runAgentLoop`'s `messages` array is *not* really `Anthropic.ContentBlock[]`** despite the type annotation — since model routing shipped (§12), it's `NormalizedContentBlock[]` (`lib/agents/providers/types.ts`, just `{type, text}` / `{type, id, name, input}`) cast in via `as unknown as`, because a real `Anthropic.ToolUseBlock`/`Usage` now carries provider-specific required fields (`caller`, `service_tier`, …) that don't exist for DeepSeek/Qwen. Anything that reads assistant-turn content from that array (there isn't much — it's mostly write-only history) needs to treat it as the normalized shape, not the full Anthropic SDK type.
- **`callModel()`'s fallback retry (`lib/agents/providers/adapter.ts`) is silent from the caller's point of view** — only `fix_run` has a configured fallback (Qwen → DeepSeek V4 Pro, per REQ-104), and a fallback-served turn only shows up as a `console.error` log plus a different `model` string in that turn's `agent_api_calls` row. There's no dashboard indicator that a run partially fell back — check server logs or the cost breakdown's `model` column if a fix run's provider mix looks surprising.

## Environment / running it

```
npm run dev                  # Next.js app
npm run bridge:playwright    # web automation bridge (needed for web projects)
npm run bridge:appium        # mobile automation bridge (needs Appium server + emulator running first)
```

Required in `.env.local` (see `.env.local.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. Already configured on this machine.
