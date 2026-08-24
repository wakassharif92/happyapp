# QA Agent — Build Specification

**Purpose of this document:** This is a complete functional and technical specification for an AI-powered, multi-project QA Agent system. The system must support any number of independent projects — both **mobile apps** and **web apps** — selectable from a dashboard, not hardcoded to one app. Build this as a Next.js web application with Supabase as the backend/database. Read this entire document before writing any code — sections reference each other, and the requirement IDs (REQ-xxx) should be used as comments/references in the code so functionality can be traced back to this spec.

---

## 1. System Overview

This system is a structured, AI-driven QA workflow accessible through a web dashboard, designed to work across **multiple independent projects** — mobile apps and web apps alike — rather than being tied to one app. The user selects which project they're working on from a project list, and everything downstream (modules, test cases, issues) is scoped to that project.

The system has **two AI agents** and **one web dashboard** with **two testing entry points**, all operating within the context of a selected project.

### 1.1 The Two Agents

| Agent | Role | Has access to |
|---|---|---|
| **QA Agent** | Generates test cases, runs automated tests against the app, triages human-reported issues, verifies fixes | Automation bridge (device or browser control — see Section 8), requirements doc, read-only codebase search, issues database |
| **Programming Agent** | Fixes confirmed bugs in the project's codebase | Full read/write codebase access, build tools, git — no automation-bridge access |

These MUST be implemented as separate agent contexts/system prompts, even though both call the Claude API. The QA Agent should never fix code. The Programming Agent should never decide whether something is a bug — it only fixes what it's told is a confirmed bug.

### 1.2 Project Scoping

Every module, test case, test run, and issue belongs to exactly one project. The dashboard requires a project to be selected (via a project switcher, REQ-071) before any of the Automated Testing or Manual QA Reporting features are usable. Project-specific configuration includes: the app type (mobile or web), which requirements doc to read, which local codebase path the Programming Agent should search/edit, and which automation bridge target to use (an emulator/device for mobile, a browser instance for web — see Section 8).

### 1.3 Mobile vs. Web Projects

A project is either **mobile** or **web**, set at creation and driving which automation approach is used:

- **Mobile projects** need a running Android emulator/iOS simulator or a connected physical device, driven via Appium (REQ-091).
- **Web projects do NOT need any emulator or virtual device** — there is no phone hardware to simulate. Instead, the QA Agent drives a real or headless browser instance directly using a browser automation tool (Playwright — REQ-092), which is lighter-weight and faster to spin up than a mobile emulator.

Everything else in this spec (modules, test cases, issues, triage, fix pipeline) works identically regardless of app type — only the automation layer underneath differs. See Section 8 for the full detail.

### 1.4 The Two Dashboard Entry Points

1. **Automated Testing** — pick a module, generate test cases, run them all via the automation bridge, get tagged results.
2. **Manual QA Reporting** — a human tester reports an issue in plain language; the QA Agent investigates and classifies it before it becomes a tracked bug.

Both entry points feed the same central **Issues** table and the same fix pipeline. This is the single most important architectural decision in this spec — do not build two separate tracking systems.

---

## 2. Tech Stack (fixed — do not substitute)

- **Frontend/Backend**: Next.js (App Router), TypeScript
- **Database & Auth**: Supabase (Postgres + Supabase Auth + Supabase Realtime for live dashboard updates — use Realtime instead of a custom WebSocket server)
- **AI**: Multi-provider — Claude API (Anthropic), DeepSeek API, and Qwen API (Alibaba Cloud/DashScope), routed per task via a provider adapter (see Section 9). Using tool use / function calling for both agents' action loops. Text-only — no vision/screenshots used anywhere (see REQ-104).
- **Mobile automation**: Appium, driving a local Android emulator/iOS simulator or connected device (REQ-091) — QA Agent reasons over the accessibility tree as text, not screenshots
- **Web automation**: Playwright, driving a local or headless browser instance — no emulator needed (REQ-092) — QA Agent reasons over the DOM/accessibility tree as text
- **Storage**: Supabase Storage for screenshots/evidence attached to issues

---

## 3. Data Model (Supabase / Postgres)

### REQ-000: `projects` table
The top-level entity. Every other table below is scoped to a project either directly or via `module_id`.
```
id                    uuid primary key
name                  text
description           text
app_type              text        -- 'mobile' | 'web'
platform              text        -- for mobile: 'android' | 'ios' | 'both'; for web: null or target browser(s)
framework             text        -- e.g. 'flutter', 'react_native', 'native', 'react', 'nextjs', 'vue'
codebase_path         text        -- local path or repo reference the Programming Agent works against
requirements_doc_ref  text        -- pointer to where the requirements doc lives (file path, URL, or Supabase Storage key)
automation_target     text        -- for mobile: the Appium bridge URL (REQ-091); for web: the base URL Playwright should open (REQ-092)
created_at            timestamptz
```

### REQ-001: `modules` table
Represents a testable feature area within a project, extracted from that project's requirements doc.
```
id            uuid primary key
project_id    uuid references projects(id)
name          text
description   text
requirement_ref text  -- pointer/section id in the source requirements doc
created_at    timestamptz
```

### REQ-002: `test_cases` table
Individual scenarios generated for a module.
```
id            uuid primary key
module_id     uuid references modules(id)
title         text
scenario      text        -- plain-language steps, what the agent will do
priority      text        -- 'high' | 'medium' | 'low'
status        text        -- 'not_run' | 'running' | 'pass' | 'fail'
last_run_at   timestamptz
created_at    timestamptz
```

### REQ-003: `test_runs` table
One row per execution of a module's full test suite (an "automated testing" run).
```
id            uuid primary key
module_id     uuid references modules(id)
started_at    timestamptz
completed_at  timestamptz
status        text   -- 'running' | 'completed' | 'failed'
total_cases   int
passed_count  int
failed_count  int
```

### REQ-004: `issues` table
The central table. Every problem — whether found by the automated agent or reported by a human — lives here.
```
id                  uuid primary key
source              text        -- 'automated' | 'manual'
module_id           uuid references modules(id)
test_case_id        uuid references test_cases(id) nullable  -- set if source = 'automated'
reported_by         uuid references auth.users(id) nullable  -- set if source = 'manual'
title               text
description         text
reproduction_steps  jsonb        -- ordered array of steps
evidence_urls       text[]       -- screenshots in Supabase Storage
tag                 text         -- 'bug' | 'not_a_bug' | 'approval' | 'fixed' | 'verified'
tag_reasoning       text         -- QA Agent's explanation for the classification (REQ-050)
severity            text         -- 'high' | 'medium' | 'low', nullable until triaged
status              text         -- 'new' | 'investigating' | 'triaged' | 'fixing' | 'fixed' | 'verified' | 'closed'
assigned_agent_run_id uuid nullable -- links to programming_agent_runs
created_at           timestamptz
updated_at           timestamptz
```

### REQ-005: `programming_agent_runs` table
Tracks each invocation of the Programming Agent.
```
id            uuid primary key
issue_ids     uuid[]       -- the batch of issues handed off together
status        text         -- 'running' | 'completed' | 'failed'
started_at    timestamptz
completed_at  timestamptz
summary       text         -- what was changed, for human review
```

### REQ-006: `agent_events` table
An append-only log of every step either agent takes, for the live activity feed (REQ-070) and audit trail.
```
id            uuid primary key
run_type      text     -- 'test_run' | 'issue_triage' | 'fix_run'
run_id        uuid     -- references test_runs.id or programming_agent_runs.id or issues.id
event_text    text     -- human-readable: "Running MV-03: verifying badge updates..."
event_type    text     -- 'info' | 'pass' | 'fail' | 'bug_found' | 'fix_applied' | 'error'
created_at    timestamptz
```

---

## 4. Feature: Automated Testing (Entry Point 1)

### REQ-010: Module list generation
The system must have a mechanism to send a project's requirements doc to Claude and receive back a structured JSON list of modules (matching the `modules` schema in REQ-001). This can be a one-time/on-demand admin action ("Sync modules from requirements doc") rather than something re-run on every page load.

### REQ-011: Module selection UI
The dashboard's Automated Testing page lists all modules (from REQ-001) for the selected project as cards, each showing: module name, count of test cases, last run status (pass/fail counts), and a "Generate Test Cases" or "QA It" button depending on state.

### REQ-012: Test case generation
When the user clicks "Generate Test Cases" for a module, the QA Agent is invoked with: the module's requirement text + any existing related code context. It must return a structured list of test cases (title, scenario, priority) matching REQ-002, covering both happy-path and edge cases. Save all generated cases to `test_cases` before showing them to the user. The user can edit/delete generated test cases before running them (simple CRUD, no AI needed for this part).

### REQ-013: "QA It" — running the test suite
Clicking "QA It" on a module:
1. Creates a `test_runs` row with status `running`.
2. For each `test_case` in the module (status `not_run` or user-selected subset), the QA Agent drives the project's automation bridge (mobile: REQ-091, web: REQ-092) to execute the scenario step by step.
3. After each test case, the agent determines pass/fail by comparing observed screen state (screenshot + optional accessibility/DOM tree) against the expected scenario outcome.
4. On fail, an `issues` row is created automatically (source = 'automated', tag = 'bug' by default, since automated test failures are presumed real until triaged — see REQ-051 for the exception).
5. Every step (start of case, pass, fail, bug created) is written to `agent_events` (REQ-006) so the dashboard can show live progress (REQ-070).
6. On completion, update the `test_runs` row with final counts and status `completed`.

### REQ-014: Stopping/pausing a run
The user must be able to stop an in-progress test run from the dashboard. This should gracefully finish the current test case, then halt, updating `test_runs.status` to `failed` (interrupted) rather than leaving it stuck on `running`.

---

## 5. Feature: Manual QA Reporting (Entry Point 2)

### REQ-020: Issue report form
A simple form: module (dropdown from REQ-001, scoped to the current project), title, description (free text), optional screenshot upload (to Supabase Storage, linked via `evidence_urls`). On submit, creates an `issues` row with `source = 'manual'`, `status = 'new'`, `tag = null` (not yet classified).

### REQ-021: Triage trigger
Manually reported issues do not auto-triage on submission (to avoid surprising API costs on every report). Instead, they appear in a "Needs Triage" queue on the dashboard, and the user (or a scheduled job) triggers "Investigate" per issue or in bulk.

### REQ-050: QA Agent triage logic
When triage runs for an issue, the QA Agent must:
1. Attempt to reproduce the reported behavior via the project's automation bridge, following any reproduction steps the human provided (or inferring reasonable steps from the description + module context).
2. Cross-reference the relevant section of the requirements doc for that module.
3. Optionally read relevant source code (read-only) if the requirements doc doesn't resolve the question.
4. Classify into exactly one of:
   - `bug` — reproducible and contradicts documented/expected behavior
   - `not_a_bug` — reproducible but matches documented behavior (a business rule) — the agent MUST explain which requirement justifies this in `tag_reasoning`
   - `approval` — either not reproducible, or the requirements doc is silent/ambiguous on expected behavior. These require a human decision and must NOT be auto-forwarded to the Programming Agent under any circumstance.
5. Write the classification, `tag_reasoning`, and update `status` to `triaged`. Log every reasoning step to `agent_events`.

### REQ-051: Automated test failures also go through lightweight triage
Even automated test failures (REQ-013) should get a one-line `tag_reasoning` at minimum — the agent should not blindly assume every failed assertion is a real bug (e.g. test flakiness, timing issues). If the QA Agent has low confidence a failure is real, it should tag it `approval` instead of `bug`.

### REQ-052: Approval queue view
A dedicated dashboard view filtered to `tag = 'approval'`, since these need a human decision, not further agent action. Each item shows the agent's investigation notes so the human can decide quickly. The human resolves these by manually setting the tag to `bug` or `not_a_bug` — this is a plain UI action, no AI call needed.

---

## 6. Feature: Fix Pipeline (Programming Agent)

### REQ-060: Fix batch trigger
The dashboard must let the user specify how many bugs to fix "now" (e.g. an input: "Fix 3 issues now" button). On trigger:
1. Backend selects up to N issues where `tag = 'bug'` and `status = 'triaged'`, ordered by severity/priority, scoped to the current project.
2. Creates a `programming_agent_runs` row referencing those issue IDs.
3. For each issue, builds a self-contained context bundle (REQ-061) and invokes the Programming Agent.

### REQ-061: Context bundle per issue
The Programming Agent must NOT receive the full conversation history of the QA Agent or other issues. Build a minimal, self-contained payload per issue:
```json
{
  "issue_id": "...",
  "title": "...",
  "description": "...",
  "reproduction_steps": [...],
  "tag_reasoning": "...",
  "relevant_requirement_text": "...",
  "relevant_files": ["..."]   // best-effort guess via code search, agent can search further
}
```

### REQ-062: Fix execution
The Programming Agent reads the relevant source code for the project (using `codebase_path` and `framework` from the project's REQ-000 row to pick the right build/lint commands — e.g. `flutter analyze` for Flutter, `npm run lint` / `npm run build` for a web framework), makes the code change, runs available tests, and commits with a message referencing the issue ID (e.g. `fix(verification): resolve badge not updating [MV-07]`). It must update `issues.status` to `fixed` and write a summary to `programming_agent_runs.summary`. It must NOT mark the issue `verified` — only the QA Agent can do that (REQ-063).

### REQ-063: Re-verification
After a batch of fixes completes, the QA Agent automatically re-runs the original reproduction steps (or original failing test case, if `source = 'automated'`) for each fixed issue. If it now passes, set `issues.status = 'verified'`. If it still fails, revert `status` to `triaged` and `tag` stays `bug`, with a note appended explaining the fix didn't resolve it — do not silently loop; surface this clearly on the dashboard.

---

## 7. Dashboard UI Requirements

### REQ-070: Live activity feed
Any page showing an in-progress run (test run or fix run) must subscribe to `agent_events` via Supabase Realtime and render new events as they arrive, without a page refresh. Format: timestamp + icon (pass/fail/info/bug) + event text.

### REQ-071: Navigation structure
The layout has a **project switcher** persistently visible (e.g. top-left dropdown, similar to a workspace switcher) listing all rows from `projects` (REQ-000), plus an "Add Project" option. Selecting a project scopes the entire dashboard to it — this should be reflected in the URL (e.g. `/projects/[projectId]/...`) so links and refreshes preserve context, not just client-side state.

Below the project switcher, top-level nav (all scoped to the selected project): **Dashboard** (overview: open bugs, approval queue count, recent runs) · **Automated Testing** (REQ-011) · **Report Issue** (REQ-020) · **All Issues** (filterable table: module, tag, status, source) · **Approval Queue** (REQ-052) · **Modules** (admin: sync from requirements doc, REQ-010) · **Project Settings** (edit the fields from REQ-000: app type, codebase path, requirements doc ref, automation target).

### REQ-074: Add Project flow
A form to create a new `projects` row: name, app type (mobile/web — this choice changes which fields show next, e.g. platform for mobile vs. base URL for web), framework, codebase path, requirements doc reference, automation target. After creation, the user lands on that project's (empty) Modules page and can run REQ-010 (sync modules from requirements doc) to get started. No project should be usable for testing until its `automation_target` and `codebase_path` are set — validate this before enabling the "QA It" button.

### REQ-072: Issue detail view
Clicking any issue shows: description, reproduction steps, evidence screenshots, tag + reasoning, full status history, and (if applicable) the linked programming agent run summary and re-verification result.

### REQ-073: Progress counters
Every module card and the main dashboard must show live counts: total test cases, passed, failed/bugs open, fixed, verified — as plain numbers/progress bars, not just a status string.

---

## 8. The Automation Bridge (Mobile and Web)

Every project needs some way for the QA Agent to actually interact with the running app. This differs by app type — a mobile app needs a device to run on, a web app just needs a browser tab.

### REQ-090: Bridge service — shared design
Since Next.js API routes are not well-suited to holding a long-lived automation session, implement small standalone Node services (can live in the same repo) that:
- Maintain the automation session (mobile: an Appium session; web: a Playwright browser context)
- Expose simple internal endpoints the Next.js backend calls: `POST /action` (tap/click/type/swipe/screenshot), `GET /screenshot`, `GET /dom` or `GET /accessibility_tree`
- Are only ever called server-side from Next.js API routes — never exposed to the browser directly
- Run locally (per the "local machine" deployment model) — not deployed to Vercel/cloud with the rest of the Next.js app

### REQ-091: Mobile bridge (Appium)
For projects with `app_type = 'mobile'`: a bridge (`/appium-bridge`) that maintains an Appium session against a local Android emulator/iOS simulator or connected physical device. Requires the emulator/device and Appium server to be running locally before use — an unavailable bridge should surface a clear "device not connected" state on the dashboard rather than silently failing.

### REQ-092: Web bridge (Playwright) — no emulator required
For projects with `app_type = 'web'`: a bridge (`/playwright-bridge`) that launches and maintains a Playwright browser context pointed at the project's `automation_target` (base URL). This is deliberately lighter weight than the mobile path:
- **No emulator, simulator, or virtual device of any kind is needed** — a web app just runs in an ordinary browser tab, headless or headed, the same as it would for any visitor.
- Playwright can run headless (faster, no visible window — good for automated overnight runs) or headed (visible browser — useful while first building/debugging test scenarios so you can watch what the agent is doing).
- Playwright natively exposes the page's DOM/accessibility tree as structured text, which is what the QA Agent reasons over — this system does not use screenshots or vision anywhere (see REQ-104).
- Since there's no device to keep "connected," a web bridge can be started on-demand per test run rather than needing to stay persistently running like the mobile emulator does — though keeping it warm avoids the few-hundred-ms browser launch cost on every run.

### REQ-093: Multiple concurrent bridges
Since multiple projects can be active at once (and could mix mobile and web), each project's `automation_target` (REQ-000) points to its own bridge instance/port. Both bridge services should be startable multiple times on different ports rather than assuming a single global instance of either.

---

## 9. Agent Implementation Notes (for the AI writing this code)

### REQ-100: Multi-provider tool use, not a single hardcoded model
This system is **provider-agnostic**, not built against one vendor. Both agents run the same core loop — send context + available tools → model responds with either a tool call or a final answer → execute the tool call → feed the result back → repeat until the agent signals completion or a max-turns safety limit is hit — but which model/provider handles a given step is configurable per task (see REQ-104). Do not hardcode a single vendor's SDK into the agent loop; implement a thin adapter (REQ-105) so the loop code is identical regardless of which model answers it.

### REQ-104: Model routing table (finalized)
No screenshots/vision are used anywhere in this system — the QA Agent reasons entirely over structured text (DOM tree for web via Playwright, accessibility tree for mobile via Appium) and plain-language descriptions from human-reported issues. This makes every step pure text/tool-use reasoning, which is why a mixed-provider setup is viable. Route each task to a model as follows, and make each row's model swappable via config (REQ-106), not hardcoded:

| Task | Model | Reasoning |
|---|---|---|
| Generate test cases (REQ-012) | DeepSeek V4 Flash | Low-risk, one-shot structured generation; human reviews/edits before running anyway |
| QA It — automated test execution (REQ-013) | DeepSeek V4 Pro | Multi-turn text-only tool-use loop against the accessibility/DOM tree; no vision needed |
| Automated-failure lightweight triage (REQ-051) | DeepSeek V4 Pro | Same model as the run itself — mechanical flakiness check, not a judgment call |
| Manual issue triage / classification (REQ-050) | Claude Sonnet 5 | The one true judgment call in the pipeline (bug vs. business rule vs. approval) — no downstream check catches a wrong call here, so this step stays on the most reliable model regardless of cost |
| Fix It — Programming Agent (REQ-062) | Qwen3 Coder 480B-A35B (fallback: DeepSeek V4 Pro) | Code-specialized model; re-verification (REQ-063) is the safety net if a fix is wrong, so this role tolerates a cheaper/riskier model better than triage does |
| Re-verification (REQ-063) | Same model as the original test case/issue | No new judgment being made — just re-running an existing check |

### REQ-105: Provider adapter
Build a single internal interface (e.g. `callModel(task, messages, tools)`) that all agent code calls — never call a provider SDK directly from agent logic. Under the hood, route to the correct provider based on REQ-106's config. DeepSeek and Qwen both expose OpenAI-compatible chat completion endpoints; Claude uses the Anthropic Messages API — the adapter normalizes tool-call format differences between these so the rest of the codebase (tool definitions, the agent loop, event logging) is written once and works against any configured model.

### REQ-106: Model selection is config, not code
Store the task→model mapping from REQ-104 in a single config file (e.g. `model-routing.json` or environment variables), not scattered through the codebase. This must be trivial to change — e.g. swapping the Fix It model from Qwen3 Coder to a different provider should be a one-line config edit, not a code change, so future model comparisons/swaps don't require touching agent logic.

### REQ-107: Per-provider API keys
Each provider (Anthropic, DeepSeek, Qwen/Alibaba Cloud) needs its own API key stored as its own environment variable (e.g. `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `QWEN_API_KEY`), never hardcoded, never exposed to the browser — only read server-side by the adapter (REQ-105).

### REQ-101: QA Agent tool set
`automation_action(type, params)` (routes to the Appium or Playwright bridge depending on the project's `app_type`), `get_dom_or_accessibility_tree()`, `get_requirement_text(module_id)`, `search_codebase(query)` (read-only), `create_issue(...)`, `update_issue_tag(...)`, `log_event(...)`. No screenshot/vision tool — this system is text-only end to end (see REQ-104).

### REQ-102: Programming Agent tool set
`read_file(path)`, `write_file(path, content)`, `run_command(cmd)` (restricted to the project's configured build/lint/test commands and `git commit`), `log_event(...)`. Explicitly no automation-bridge tools.

### REQ-103: Safety limits
Both agents need a max-turn / max-tool-call limit per invocation (e.g. 25) to prevent runaway loops burning API credits, with the run marked `failed` and a clear `agent_events` entry if the limit is hit. This limit applies regardless of which model (REQ-104) is handling the task.

---

## 10. Explicitly Out of Scope (for this build)

- Cloud device farms (BrowserStack etc.) — local Appium/Playwright only for now
- LangChain/LangGraph, RAG, embeddings, vector databases — not needed; data lookups are direct/structured (see REQ-101/102 tool sets)
- Multi-user roles/permissions beyond basic Supabase Auth login — single-team use for now
- iOS device support for mobile projects — Android emulator first; structure the mobile bridge so iOS can be added later without a rewrite
- Cross-browser matrix testing for web projects (Firefox/Safari/etc.) — start with a single browser engine via Playwright; expanding to multiple engines is a config change, not a rewrite

---

**End of specification.** Build in this order: (1) Supabase schema from Section 3, (2) Next.js scaffold + auth, (3) Projects table + project switcher + Add Project flow (REQ-000, REQ-071, REQ-074), (4) Modules + manual issue reporting UI (REQ-011, REQ-020) since these need no AI, (5) Automation bridge services — start with whichever app type (mobile or web) your first project needs (REQ-090 through REQ-093), (6) QA Agent loop + Automated Testing feature (Section 4), (7) Manual triage (Section 5), (8) Programming Agent + fix pipeline (Section 6), (9) Realtime activity feed polish (REQ-070).
