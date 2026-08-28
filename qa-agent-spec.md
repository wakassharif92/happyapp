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

## 11. Team Report Inbox (added after initial build — not in the original spec)

A second and third, informal issue-intake channel alongside REQ-020's in-app form: team members either message a dedicated WhatsApp Business number, or fill out a plain public web form — both land in one shared review list. Deliberately **not** wired into the `issues` table or REQ-050's triage pipeline — this is a lightweight inbox a human skims and categorizes by hand, not a third/fourth entry point into the QA Agent's classification logic.

### REQ-110: WhatsApp webhook receiver
A route (`POST /api/webhooks/whatsapp`) implementing Meta's WhatsApp Business Cloud API webhook contract: a one-time `GET` verification handshake (echo `hub.challenge` back after checking `hub.verify_token`), and `POST` event notifications carrying incoming messages. Every payload's `X-Hub-Signature-256` header must be verified (HMAC-SHA256 over the raw body using the app's secret) before any data is trusted or persisted.

### REQ-111: `team_reports` data model
```
id             uuid primary key
source         text                -- 'whatsapp' | 'web' (REQ-116)
wa_message_id  text unique         -- WhatsApp only — idempotency key against webhook retries
sender_name    text                -- WhatsApp contact profile name, or the name typed into the web form
sender_phone   text                -- WhatsApp only — the sending number
project_id     uuid references projects(id)  -- web only (REQ-117) — WhatsApp reports have no project context
other_project_name text           -- web only (REQ-117) — free-text fallback when the reporter's project isn't in the dropdown; never creates a real `projects` row (see REQ-117)
page_name      text                -- web only — free-text page/screen name the issue occurred on, optional
message_text   text                -- the message body, an image's caption, or a placeholder for unsupported types
image_path     text                -- object path in a private Storage bucket, if an image was attached
category       text                -- 'frontend' | 'backend' | 'any' | null (REQ-113)
received_at    timestamptz
```
Image attachments are re-hosted in a private Supabase Storage bucket — never linked to directly, matching REQ-020's existing evidence-screenshot handling. For WhatsApp this means the two-step media API (resolve a short-lived URL from the media id, then fetch it); for the web form it's a direct file upload.

### REQ-112: Report inbox UI
A single page listing `team_reports` from both channels, newest-first: sender (name, falling back to phone number for WhatsApp reports that have neither), a source indicator (WhatsApp vs Web), the project name when one was given (web only, falling back to the free-text `other_project_name` when the reporter used the "Other" option), the page/screen name when given, message text, and the attached image when present (resolved via a signed URL). Reachable from a persistent nav entry, not nested under any specific project.

### REQ-113: Category is a plain human action, not an AI classification
Each report gets a dropdown — Frontend / Backend / Any / left unset — set directly by whichever developer reviews it. No agent call, no `tag_reasoning`, no automated classification of any kind; this is intentionally simpler than REQ-050's triage logic.

### REQ-114: Idempotency
Meta retries webhook deliveries on any non-200 or slow response. `wa_message_id` is unique on `team_reports`, and inserts must no-op on conflict rather than erroring, so retried deliveries never create duplicate rows.

### REQ-115: Exception to REQ-090's "local machine" deployment model
Every other server-side piece of this system (the app, both automation bridges) runs on the local machine per REQ-090. The WhatsApp webhook is the one necessary exception: Meta's servers must be able to reach it over the public internet, so it needs either a tunnel (for local development) or a real public deployment — it cannot be exercised end-to-end purely on `localhost` the way the rest of the system can. The web form (REQ-116) has no such requirement — it's just another page in the same app.

### REQ-116: Public web report form
A page requiring no login — WhatsApp's Business API setup proved too heavy a barrier for routine team reporting, so this is the low-friction alternative: name, issue detail, an optional image, submit. Must be mobile-responsive, since most reporters will be on a phone. Explicitly exempted from the app's normal auth guard (REQ-071 assumes a logged-in user everywhere else; this route and the WhatsApp webhook are the only two exceptions).

### REQ-117: Web reports may specify a project
Unlike the WhatsApp channel (no practical way to ask for this over a chat message), the web form includes a project dropdown, since this system already tracks multiple independent projects (Section 1.2) and a report untraceable to a specific one is less useful to act on. The dropdown includes an "Other (not listed)…" option that reveals a free-text project-name field (`other_project_name`) instead of `project_id` — the public form is unauthenticated, so it must never be able to insert directly into `projects` (that would let anyone with the link create arbitrary projects); a dev promotes the note to a real project by hand if warranted.

### REQ-118: Web reports may specify a page/screen name
The web form includes an optional free-text "page / screen" field (`page_name`) so a report is traceable to roughly where in the app the issue occurred, without requiring the reporter to navigate a module picker.

### REQ-119: Old QA Agent nav is disabled, not removed
The original project-scoped nav (module sync, Automated Testing, Report Issue, All Issues, Approval Queue, Project Settings — REQ-071/074) is commented out of the project layout rather than deleted. The Team Reports link and project switcher remain active. This reflects a deliberate pause on that surface while the Team Report Inbox (Section 11) is the primary flow — the old nav's component and routes are untouched underneath and can be restored by uncommenting `components/OldQaAgentNav.tsx`'s usage in `app/projects/[projectId]/layout.tsx`.

---

## 12. Issue Board (`/dashboard`) (added after initial build — not in the original spec)

A multi-project QA/Issue Tracking board, separate from both Section 5's manual triage flow and Section 11's Team Report Inbox — this is the "something else" REQ-119 made room for. Started as a frontend-only mock prototype; now backed by real Supabase tables (`board_issues`, `board_issue_comments`, `board_issue_activity` — Section 13's REQ-127 migration), deliberately componentized (`Sidebar`, `TopBar`, `TabNav`, `ProjectSwitcher`, `IssueCard`, `IssueDetailPanel`, `NewIssueModal`, `CategoryDropdown`, `MoveToMenu`, `StatusBadge`, `SeverityTag`, `Thumbnail`, `EmptyState`, all under `components/dashboard/`) so wiring the real backend on didn't require changing any component's props.

### REQ-120: Project-scoped, tab-based issue board
A project switcher (real `projects` rows) filters the entire board. Six tabs — In Progress, AI Fix, Pending, Done, Closed, User Complaints — each with a live count badge, navigable from both a sidebar nav list and a pill-style `TabNav` at the top of the content area (two paths to the same state, kept in sync). User Complaints is visually distinct (amber/orange accent) since it's a different intake source needing different triage handling, not a different data shape.

### REQ-121: Issue card and detail panel
Each `IssueCard` shows a thumbnail — a real image/video when one exists (e.g. a Slack attachment), otherwise a colored placeholder with an image/video/paperclip icon — sender initial + name, truncated title/message, an inline-editable category dropdown (Frontend/Backend/Design/Requirements/Other), a status badge matching the active tab's color, relative timestamp, and an icon-button row (copy PDF link, open detail, move-to-tab menu). Clicking a card opens `IssueDetailPanel`, a right-side slide-over with full message text, sender/source/project/timestamp metadata, category + status dropdowns, a "Copy Public PDF Link" primary action, an internal notes/comments thread, and a chronological activity log — comments/activity are lazy-loaded per issue (`getIssueThread` server action) rather than fetched for the whole board up front. User Complaints cards/panels additionally show a Low/Medium/High `SeverityTag` and a "Convert to Dev Issue" button (moves the report into Pending).

### REQ-122: Scoped light/dark theme, independent of the rest of the app
`globals.css` deliberately disables Tailwind's `dark:` variant app-wide ("Light mode only, by design"). The Issue Board's dark mode toggle does **not** touch that — `app/dashboard/theme.css` defines a separate set of CSS custom properties scoped under a `.qa-board` wrapper class (light values on `.qa-board`, dark overrides on `.qa-board[data-theme="dark"]`), and every dashboard component reads colors via `var(--db-*)` / `var(--status-*)` / `var(--severity-*)` arbitrary-value utilities instead of `dark:` classes. Toggling theme on `/dashboard` never affects any other route.

### REQ-123: Responsive layout
The sidebar collapses to icon-only below the `lg` breakpoint (labels and counts hidden, project switcher moves into the top bar instead); the issue list is a single-column, divider-free stack of rows at every viewport width rather than a multi-column grid, matching the Linear/Height "list, not cards-in-a-grid" reference aesthetic.

### REQ-124: Discoverability and scope boundary
Sits behind the app's normal auth guard (`proxy.ts`) like every other authenticated route — no bypass was added, unlike REQ-116's public form. `app/dashboard/page.tsx` is a server component that fetches `projects` and `board_issues` once; `DashboardClient.tsx` holds all interactive state (theme, selected project/tab, search) and calls server actions (`app/dashboard/actions.ts`) for every mutation (category change, move, comment, create) — optimistic local updates for snappy UI, persisted via the action, refreshed via `revalidatePath` on next navigation and live via REQ-133's Realtime subscription in between.

The Board's own `Sidebar` (`components/dashboard/Sidebar.tsx`) links directly to `/projects/[projectId]/integrations` (project-scoped via the currently selected project) and to `/projects` ("All Projects") — everything reachable from the Board never requires visiting the legacy project-scoped nav. That legacy nav (`app/projects/[projectId]/layout.tsx`) had its "Team Reports" and a redundant "Issue Board" self-link removed for the same reason REQ-119 disabled the old QA Agent nav: since the Board is the default landing screen (REQ-125), that old sidebar isn't meant to compete with it for attention — it now shows only the project switcher and an "Integrations" link (kept there too, as a secondary path, since someone might land there directly without going through the Board first).

### REQ-125: Issue Board is the default landing screen
`/dashboard` is where an authenticated user lands: `app/page.tsx` (`/`) redirects here, and both places that redirect after sign-in — `app/login/actions.ts`'s `submitLogin`/`authenticate` action and `proxy.ts`'s "already signed in, redirect away from `/login`" branch — now point at `/dashboard` instead of `/projects`. The old project-scoped area (REQ-071's nav, modules, triage, etc.) is still fully reachable, just one click further away: the Issue Board's `Sidebar` has an "All Projects" link (`components/dashboard/Sidebar.tsx`) back to `/projects`.

---

## 13. Slack Integration (added after initial build — not in the original spec)

Each project can independently connect its own Slack workspace/channel; messages posted there automatically become issues in that project's Pending tab (Section 12). This is what made backing the Issue Board with real tables (REQ-127 below) necessary rather than optional — see PROGRESS.md for that decision's reasoning. Full Slack App setup walkthrough (scopes, OAuth redirect URL, Event Subscriptions URL, credentials) is in `docs/slack-setup.md`, not duplicated here.

### REQ-126: Slack App — scopes and two integration surfaces
Bot token scopes: `channels:read`, `channels:history`, `files:read`, `chat:write`, `team:read` (`docs/slack-setup.md` §2) — private-channel support (`groups:read`/`groups:history`) is optional and off by default; REQ-127's channel listing only requests `public_channel` to match, since Slack's `conversations.list` fails its *entire* call with `missing_scope` if `types` names a type the token lacks scope for, even when the token has scope for the other types named. Two independent Slack App features are involved: **OAuth** (installing the app into a workspace and getting a bot token — REQ-127) and **Event Subscriptions** (receiving messages after that — REQ-129). `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` are env vars, never hardcoded; there's no separate "app base URL" env var — the OAuth `redirect_uri` is derived from the incoming request via `getPublicOrigin()` (`lib/slack/requestOrigin.ts` — see REQ-127's note on why this isn't simply `request.nextUrl.origin`), so it can't go stale after a tunnel restart the way a hardcoded URL would.

### REQ-127: Data model and OAuth connect flow
`slack_connections` (`supabase/migrations/0007_slack_connections.sql`): one row per project (`project_id unique`), `team_id`/`team_name`, `channel_id`/`channel_name` (null until a channel is picked), `access_token` (AES-256-GCM ciphertext, `lib/slack/tokenCrypto.ts` — see REQ-132), `bot_user_id`, `status` (`pending_channel` → `connected`), `connected_by`. Four routes implement the flow: `GET /api/slack/connect?project_id=` (redirects to Slack's authorize URL, `project_id` embedded in a signed `state` param — `lib/slack/oauthState.ts` — so a caller can't forge a state pointing at a project they don't have access to); `GET /api/slack/callback` (exchanges the code via `oauth.v2.access`, decodes `state`, upserts the connection with no channel yet); `GET /api/slack/channels?project_id=` (lists channels via `conversations.list` using the stored token, for the channel-picker UI); `POST /api/slack/select-channel` (attaches a channel, flips `status` to `connected`); `POST /api/slack/disconnect` (revokes the token via `auth.revoke`, deletes the row).

`redirect_uri` (sent both to `/oauth/v2/authorize` and to `oauth.v2.access` during the token exchange) is built via `lib/slack/requestOrigin.ts`'s `getPublicOrigin()`, **not** `request.nextUrl.origin` directly — behind a tunnel (ngrok, during local dev), TLS terminates at the tunnel's edge and the local Next.js server only ever sees a plain-HTTP hop from the tunnel agent to `localhost`, so `request.nextUrl.origin` reports the local address instead of the public one Slack (and the user's browser) actually used. `getPublicOrigin()` reads `X-Forwarded-Proto`/`X-Forwarded-Host` (which ngrok sets correctly) and falls back to `request.nextUrl.origin` only when neither is present — found live during setup as a `redirect_uri did not match any configured URIs` error from Slack even though the app's own registered URL was correct.

### REQ-128: Events webhook — verification and fast ack
`POST /api/slack/events` is one shared endpoint for every connected project. Handles Slack's `url_verification` challenge on setup. Every request is verified via `lib/slack/verifySignature.ts` (HMAC-SHA256 over `v0:{timestamp}:{rawBody}` using `SLACK_SIGNING_SECRET`, timing-safe comparison, rejects if the timestamp is more than 5 minutes old — replay protection) before any data is trusted, same shape as REQ-110's WhatsApp signature check. Like the WhatsApp webhook, this route has no Supabase session (Slack's server calling in) and is exempted from `proxy.ts`'s auth guard, authenticated instead by the signature check. Message events are acknowledged with `200` immediately; file download, Storage upload, and the DB insert happen in a fire-and-forget async call after the response is sent — this only works because the app runs as one long-lived Node process (REQ-090/115's existing constraint), not because of any new queue infrastructure.

### REQ-129: Message → issue routing
On a `message` event: looked up by `(team_id, channel_id)` against `slack_connections` where `status = 'connected'` — no match means the message isn't from a connected channel and is silently ignored (routine, not an error). Bot messages (`event.bot_id` set — includes this app's own confirmation replies), edits (`message_changed`), and deletions (`message_deleted`) are all ignored. Sender display name is resolved via `users.info`. Title is the first ~60 characters of the message text; the full text becomes the issue's message body.

### REQ-130: File attachments
If `event.files` includes an image or video, it's downloaded via `lib/slack/slackApi.ts`'s `downloadSlackFile` (Slack file URLs require the same bot token as every other API call, passed as a normal `Authorization: Bearer` header — this is the one Slack "API call" that isn't a `slack.com/api/*` method) and uploaded to the existing private `whatsapp-media` Storage bucket under a `slack-<uuid>.<ext>` path (that bucket's name is a legacy artifact at this point — REQ-111 already documented it as holding both WhatsApp and web-form uploads; adding Slack's didn't justify a third bucket). `board_issues.media_url` stores the object **path**, not a public URL, the same convention as `team_reports.image_path` — resolved to a short-lived signed URL at render time (`app/dashboard/page.tsx`). A non-image/video attachment (e.g. a PDF) isn't uploaded, but is noted in the issue body as `[attachment: <filename>]` rather than silently dropped.

### REQ-131: Optional thread confirmation reply
After successfully creating an issue, `chat.postMessage` posts "✅ Logged as an issue in Pending." back into the source thread (`lib/slack/slackApi.ts`'s `postThreadReply`). Best-effort — wrapped so a failure here (e.g. `chat:write` scope missing) never fails the webhook or blocks the issue from having already been created.

### REQ-132: Security and reliability
**Dedup**: `board_issues` has a partial unique index on `(slack_channel_id, slack_message_ts)` (null-excluded, since every non-Slack source has both null) — the insert uses `.upsert(..., { onConflict: "slack_channel_id,slack_message_ts", ignoreDuplicates: true })`, so a retried Slack delivery (Slack retries on any non-200/slow response) is a no-op rather than a duplicate issue, same idempotency shape as REQ-114's WhatsApp dedup. **Encryption at rest**: `access_token` is AES-256-GCM ciphertext (`lib/slack/tokenCrypto.ts`, key from `SLACK_TOKEN_ENCRYPTION_KEY`), never plaintext — Supabase Vault (pgsodium) was considered and skipped since this project has no linked Supabase CLI / direct Postgres access this session, making a Vault-backed column unreliable to provision here; app-level encryption achieves the same "never plaintext at rest" property without needing extension access. **Rate limiting**: an in-memory sliding-window limiter (`lib/slack/rateLimit.ts`, 20 events per 10 seconds per `team_id`) — deliberately not Redis-backed, matching the app's single-long-lived-process architecture (REQ-090/115); a trip drops the event rather than queuing it for retry. **Failure handling**: every failure inside the async event-processing path is caught and logged (`console.error`), never thrown back out — the webhook has already returned `200` by then regardless, so a thrown error wouldn't reach Slack anyway, but an uncaught rejection would still be worth avoiding for its own sake (unhandled rejection warnings, potential process-level noise).

### REQ-133: Realtime — Slack-created issues appear without a manual refresh
`board_issues` is added to the `supabase_realtime` publication (`supabase/migrations/0008_board_issues_realtime.sql`) — **this step is easy to miss**: Supabase Realtime only broadcasts `postgres_changes` for tables explicitly added to that publication, new tables aren't included automatically, and running `alter publication supabase_realtime add table board_issues;` doesn't show any obvious confirmation in the SQL Editor if it silently fails to apply (this happened twice during verification — see PROGRESS.md for how it was diagnosed). `DashboardClient.tsx` subscribes to `INSERT` events on `board_issues` (same pattern as REQ-070's `ActivityFeed.tsx`), so a Slack message lands in an already-open Pending tab live, no reload needed.

---

## 14. Customer Support Chat + Internal Team Report Link (added after initial build — not in the original spec)

Each project gets two distinct public, no-login shareable links, replacing the idea of a single generic report form with two purpose-built ones: a **Customer Support** link opening a genuine real-time chat with an external customer, and an **Internal Team** link (project-scoped, unlike REQ-116's global `/team-report`) where team members report issues straight into that project's Pending tab.

### REQ-134: Every existing RLS policy hardened against anonymous auth (prerequisite)
Making the customer chat real-time requires giving each anonymous customer browser a genuine Supabase Auth identity (REQ-135) — but anonymous sessions still satisfy `auth.uid() is not null`, the exact check every pre-existing `authenticated_all` policy in this app used. `supabase/migrations/0009_harden_rls_against_anonymous_auth.sql` introduces `is_staff()` (`auth.uid() is not null and not (auth.jwt() ->> 'is_anonymous')::boolean`) and redefines all 13 application-table policies plus 4 Storage policies to use it instead of the bare check. **This must be applied, and staff access re-verified working, before anonymous sign-ins are ever enabled** — skipping this order would let any visitor to the public support-chat link read and write every project's issues, Slack tokens, and settings.

### REQ-135: Customer identity — email-asserted, anonymous-auth-secured
The Customer Support link is opened from inside the client's own mobile app (a deep link/button), which passes the customer's already-logged-in email as `?email=`. Opening the link without that param shows a blocking error rather than falling back to a manual prompt. `support_conversations` (`supabase/migrations/0010_support_chat.sql`, `0011_support_messages_denormalize_customer.sql`) is keyed `unique(project_id, customer_email)`; on each visit, `claimConversation()` (`app/support/[projectId]/actions.ts`, admin client) upserts on that key and re-points `customer_auth_uid` at whichever anonymous Supabase Auth session (`signInAnonymously()`) opened the link this time — so the same customer keeps one continuous message history across devices/reinstalls, while RLS (`customer_auth_uid = auth.uid()`) stays correct for whichever session is currently active. The email is trusted at face value as asserted by the host app's own login, not independently re-verified — acceptable for a first-party integration.

### REQ-136: Real-time delivery — no server-side `filter:` on postgres_changes
Both sides (`app/support/[projectId]/SupportChatClient.tsx` for the customer, `app/projects/[projectId]/support/SupportInboxClient.tsx` for the agent) subscribe to `postgres_changes` INSERT on `support_messages`/`support_conversations` **without** a `filter:` parameter, filtering client-side instead — matching `DashboardClient.tsx`'s only independently-proven-reliable pattern in this app. **Found live during verification**: a `filter: "conversation_id=eq.<id>"` param reported `"SUBSCRIBED"` but silently never delivered events for these two tables, reproduced with RLS subqueries removed, `REPLICA IDENTITY FULL` set, production build (no React Strict Mode double-invoke), and unique-per-mount channel names — none of which were the actual cause. Don't reintroduce server-side `filter:` on these subscriptions without re-verifying against a real browser first.

`support_messages.customer_auth_uid` is denormalized (copied from the parent conversation, present on every row regardless of `sender_type`) specifically so the customer's SELECT policy can be a simple equality check rather than a subquery against `support_conversations` — cross-table-subquery RLS policies are a separate, independently-suspected contributor to Realtime authorization being unreliable, though the `filter:` removal above was the change that actually fixed delivery.

### REQ-137: Internal Team link — project-scoped, lands in board_issues
`/report/[projectId]` (deliberately not `/projects/[projectId]/report`, which already exists as a different, authenticated REQ-020 feature keyed by `module_id`) mirrors `/team-report`'s form shape (name, message, optional image) but has no project dropdown — the project is fixed by the URL — and inserts into `board_issues` (`tab: 'pending'`, `source_channel: 'Team Report'`, a new value added to the check constraint) rather than the legacy `team_reports` table, so submissions appear in that project's Pending tab exactly like Slack-created issues do.

### REQ-138: Discoverability
Both links are shown with copy-to-clipboard buttons on the existing `/projects/[projectId]/integrations` page (`LinksCard.tsx`) — already this project's "external connection points" hub. The agent-side Support inbox is linked from the Issue Board's own `Sidebar.tsx`, next to Integrations.

---

## 15. HappyApp rebrand, Add/Edit Project on the board, unread indicator, image sharing, lightbox (added after initial build — not in the original spec)

The app-facing name changed from "Issue Board"/"QA Agent" to **HappyApp** throughout (`app/layout.tsx` metadata, `app/login/page.tsx`, `components/dashboard/Sidebar.tsx`); this is a display-only rename, no route or table renamed to match. Deployed to production on Vercel (`https://qa-agent-liart.vercel.app`, project `waqas-projects-51763568/qa-agent`) and pushed to `https://github.com/wakassharif92/happyapp.git` — QA Agent's own test-run pipeline, Fix pipeline, and automation bridges (Appium/Playwright) do **not** run there (Vercel serverless functions freeze after the response is sent, and the bridges are separate long-lived servers); Issue Board, Slack connect, Support Chat, Team Reports, and the Links page all work fine on Vercel since they don't depend on that long-lived-process assumption.

### REQ-139: Add/Edit Project surfaced from the board itself
`components/dashboard/ProjectSwitcher.tsx` gained an "+ Add Project" row at the bottom of its dropdown (linking to `/projects/new`) and a separate Edit icon button next to the switcher trigger (linking to `/projects/[projectId]/settings`) — previously both required navigating away to `/projects` first.

### REQ-140: Automation bridge field hidden, not deleted
The "Automation bridge URL" (`automation_target`) field is commented out of both `app/projects/new/page.tsx` and `app/projects/[projectId]/settings/SettingsForm.tsx` — it's a leftover from the old QA Agent automated-testing pipeline and irrelevant to HappyApp's main flow (Issue Board, Support Chat, Team Reports). **Non-obvious correctness detail**: on the Settings form, the visible field was replaced with `<input type="hidden" name="automation_target" defaultValue={project.automation_target ?? ""}>` rather than removed outright — `actions.ts`'s `updateProject` does `formData.get("automation_target") as string || null`, so simply deleting the field would silently wipe any project's existing `automation_target` to `null` on the next settings save. The New Project form has no such risk (nothing to preserve on create), so its field is a plain commented-out block. Both comments preserve the original JSX for easy restoration.

### REQ-141: Unread indicator on the Support nav
`support_conversations.last_read_at` (`supabase/migrations/0012_support_conversations_last_read.sql`) tracks when an agent last opened a conversation. `components/dashboard/SupportNavLink.tsx` computes `hasUnread` project-wide (any conversation whose latest customer message postdates `last_read_at`, or `last_read_at` is null) and renders a red dot on the Sidebar's Support icon; `SupportInboxClient.tsx` computes the same thing per-conversation for the red dot in the conversation list, and calls `markRead()` (an authenticated update, covered by the existing `staff_all` RLS policy) whenever a conversation is opened or a new customer message arrives while it's already open. Both subscribe to `support_messages` INSERT and `support_conversations` UPDATE **without** a server-side `filter:`, per REQ-136 — the same delivery bug reproduces on any new subscription against these two tables that adds one back.

### REQ-142: Image sharing in Support Chat
`support_messages` gained `media_url text` and `media_type text check (media_type in ('image','none')) default 'none'` (same migration as REQ-141). `components/support/ChatWindow.tsx` gained a file-attach button and pending-image preview; images upload via `app/support/[projectId]/actions.ts`'s `uploadSupportImage` (admin client, into the existing private `whatsapp-media` bucket — anonymous customers can't reach Storage directly, gated by `is_staff()` from REQ-134) and are rendered via `resolveSupportMediaUrl` (`createSignedUrl`, 1 hour). **Sending is optimistic, not Realtime-dependent, for both sides**: `SupportChatClient.tsx` and `SupportInboxClient.tsx` both append the message directly from their own `.insert().select("*").single()` response rather than waiting for the Realtime echo, using a local `URL.createObjectURL()` blob for the sender's own instant image preview (no signed-URL round-trip needed for your own just-sent image). Found live during verification: text-only messages' Realtime echo-back was reliable, but the sender's own echo for image-attached messages was not (root cause not fully pinned down — possibly the extra async delay from the image upload racing the subscription) — the optimistic-append pattern sidesteps this rather than chasing it further; Realtime dedup-by-id (`prev.some(m => m.id === row.id)`) still guards against a duplicate if the echo does arrive.

### REQ-143: Full-size image lightbox
Clicking an image bubble in `ChatWindow.tsx` opens a full-screen overlay (`lightboxUrl` state) showing the image at full size; closes via Escape, a close button, or clicking the backdrop (the image itself stops propagation so clicking it doesn't close the overlay). Verified via a scripted Playwright check against a real staff session and a seeded test message — not Realtime-dependent, so unaffected by this session's established Realtime-testing flakiness.

### REQ-144: General UI polish
Shared button/input/card utility classes (`app/globals.css`) gained consistent hover/active/focus-visible states and transitions; `TabNav.tsx` and `TopBar.tsx` picked up matching hover/shadow treatment. No behavioral changes, styling only.

---

## 16. "Send case to devs" ticketing (added after initial build — not in the original spec)

The agent escalates a support conversation to the dev-facing Issue Board as a numbered ticket; devs can ask the agent a clarifying question from the ticket without the customer ever seeing it; the agent closes the ticket once resolved, at which point the customer is told and can start a new issue in the same ongoing conversation, which gets its own new ticket number when escalated again.

### REQ-145: A ticket is a `board_issues` row, not a separate table
`supabase/migrations/0013_support_tickets.sql` adds `board_issues.ticket_number` (sequence-backed column default — every `board_issues` insert technically consumes a value, harmless, since only rows with `support_conversation_id` set are ever labeled "Ticket #N" in the UI) and `board_issues.support_conversation_id` (nullable FK to `support_conversations`). "Send case to devs" (`createSupportTicket`, `app/support/[projectId]/actions.ts`) inserts a normal `board_issues` row — `tab: 'user_complaints'`, `source_channel: 'User Complaint'` (both pre-existing values from REQ-137/the original board schema, previously unused by any real intake path) — so the existing board's move/comment/activity machinery works on it completely unmodified. There is no independent "ticket status": a ticket counts as **open** as long as its `board_issues.tab !== 'closed'`, and **closed** once it is — closing is exposed to the customer-support agent from their own Support Inbox (not just the dev board), via `closeSupportTicket`.

### REQ-146: Dev questions and ticket status ride in the same chat timeline
`support_messages.sender_type` gained `'dev'` and `'system'` alongside `'customer'`/`'agent'`; a new `support_messages.visible_to_customer boolean` (default `true`) gates every row. Both `'sent to devs'` and dev-authored questions (`askDevQuestion`) are inserted with `visible_to_customer: false` — enforced by RLS (`customer_select_own_messages` now also requires `visible_to_customer = true`), not just left to the UI to filter, so a frontend bug can never leak them to the customer. `components/support/ChatWindow.tsx` renders `'system'` messages as a centered pill and `'dev'` messages as a distinctly-colored bubble (amber) regardless of viewer, plus a small "internal" tag visible only when `visible_to_customer` is false — the agent always sees the full timeline (staff `staff_all` policy, unfiltered), the customer's query can never return these rows at all.

### REQ-147: Ticket close is customer-visible; escalation is not
`closeSupportTicket` is the one place a `'system'` message is inserted with `visible_to_customer: true` — "Ticket #N marked resolved." reaches the customer's own chat. `support_conversations.has_open_ticket` (new column) mirrors whether the conversation's latest ticket is still open, specifically so the customer's own client — which cannot read `board_issues` at all (staff-only RLS) — can drive its own UI state: `SupportChatClient.tsx` shows a "✅ marked resolved — Start New Issue" banner whenever `!has_open_ticket` and at least one customer-visible `'system'` message exists (the only such message this app ever creates, so its mere presence is sufficient signal), dismissed locally on click or on the customer's next send, and reset automatically whenever `has_open_ticket` flips back to `true` (a new ticket opened for their next complaint). The conversation itself never ends — it's the same `support_conversations` row (keyed by project + email, REQ-135) across every ticket a customer ever raises; only the ticket is scoped per-complaint.

### REQ-148: Agent and dev surfaces
`SupportInboxClient.tsx` shows a toolbar above the chat for the selected conversation: "Ticket #N · `<tab>`" + "Reply to devs"/"Close ticket" buttons when a ticket is open, or a "Send case to devs" button when none is — opens `components/support/SendToDevsModal.tsx` (email read-only from the conversation, reporter name, detail, **severity** — the same `Severity` dropdown `NewIssueModal.tsx` uses, so devs can triage User Complaints by urgency rather than first-come-first-served), which calls `createSupportTicket`. On the dev side, `IssueDetailPanel.tsx` shows a "View Conversation · Ticket #N" button whenever `issue.supportConversationId` is set, opening `components/dashboard/TicketConversationModal.tsx` — the full chat rendered via the same shared `ChatWindow`, with a text-only (`allowImages={false}`) composer wired to `askDevQuestion`. Both the ticket toolbar and the ticket modal subscribe to `board_issues`/`support_messages` Realtime **without** a server-side `filter:`, per REQ-136's established convention, so a dev moving/closing a ticket from the board updates the agent's header live and vice versa.

### REQ-149: Two-way internal side-channel, with independent read-cursors per audience
The agent can reply to a dev's question via a dedicated `components/support/ReplyToDevsModal.tsx` (`replyToDevs` action) — kept as its own small modal rather than a mode toggle on the main composer, specifically so there's never a "which mode am I in" mistake that could leak an internal reply to the customer or vice versa. It's still `sender_type: 'agent'` (it's the agent talking) with `visible_to_customer: false`, landing in the same `support_messages` timeline `TicketConversationModal.tsx` already renders unfiltered for devs — no changes needed there. `ChatWindow.tsx` flags **any** message with `visible_to_customer === false` (not just `'dev'`) with an "internal" label, since an agent's own internal reply would otherwise look identical to their normal customer-facing bubble.

Unread tracking needed a second, independent read-cursor: `support_conversations.last_read_at` (REQ-141) is the **agent's** cursor over the conversation and already extends naturally to cover dev messages (`isUnread()` in `SupportInboxClient.tsx` and `SupportNavLink.tsx` now treat `'dev'` the same as `'customer'` for unread purposes — an internal `'agent'` reply does *not* count, since the agent just sent it). Devs are a *separate* viewer of the same stream, so `board_issues.dev_last_read_at` (migration 0013) tracks when a dev last opened that ticket's `TicketConversationModal` (`markTicketReadByDev`), and `DashboardClient.tsx` computes a red dot (on both the `IssueCard` and the "View Conversation" button) whenever the latest internal agent reply for that ticket's conversation postdates it — batch-fetched once and kept live via a `filter:`-free Realtime subscription, the same shape as every other unread indicator in this app.

---

**End of specification.** Build in this order: (1) Supabase schema from Section 3, (2) Next.js scaffold + auth, (3) Projects table + project switcher + Add Project flow (REQ-000, REQ-071, REQ-074), (4) Modules + manual issue reporting UI (REQ-011, REQ-020) since these need no AI, (5) Automation bridge services — start with whichever app type (mobile or web) your first project needs (REQ-090 through REQ-093), (6) QA Agent loop + Automated Testing feature (Section 4), (7) Manual triage (Section 5), (8) Programming Agent + fix pipeline (Section 6), (9) Realtime activity feed polish (REQ-070).
