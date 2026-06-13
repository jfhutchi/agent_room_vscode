# Changelog

## 0.2.4 — 2026-06-13

- **Send honors the selected workflow.** With a workflow like Roundtable selected, Send
  now runs that workflow (the whole team responds) instead of replying with a single
  agent. A plain "Manual" selection still gets a single-agent reply.
- **Health check runs on launch.** Opening the room now auto-runs the CLI health check,
  so the provider status chips populate without clicking "Check Health."

## 0.2.3 — 2026-06-13

- **Clean agent replies even with Claude Code hooks.** The Claude stream-json parser
  now extracts only the assistant message (and final result), ignoring `system`/`hook_*`
  events — so SessionStart hook output (e.g. "Bun not found", SDK metrics) no longer
  leaks into the agent's reply.
- **Model selection** (workspace `.vscode/settings.json`): Claude tiers default to
  `sonnet` so the room doesn't fall back to an account-gated default model. Change it to
  any model your CLI can use.

## 0.2.2 — 2026-06-13

- **Send now gets a reply.** A plain message routed through Send was only logged
  (plus a workflow suggestion) and no agent answered. Send now routes to an enabled
  team member for a response. Run Workflow still runs the selected workflow; Start Build
  is the autonomous orchestration.

## 0.2.1 — 2026-06-13

- **Fix CLI invocation for current CLI versions** (found in live testing): drop
  `--ask-for-approval` from `codex exec` (non-interactive; the flag was rejected), and
  add `--verbose` to `claude -p --output-format stream-json` (the CLI requires it).
  Orchestrated builds now run instead of erroring on the first agent turn.

## 0.2.0 — 2026-06-13

- **Autonomous orchestration.** "Start Orchestrated Build" runs intake → debate →
  consensus → adversarial review (Atlas proposes, Sentinel reviews, a Security Auditor
  red-teams the plan), hands-off within a stage, with round/cycle caps, Stop, and an
  approval gate. Personal Mode only.
- **Singleton roles.** Product Owner and Final Approver allow only one holder.
- **Chat redesign.** Sender avatars, markdown + code blocks, quiet metadata, hover
  actions; the composer now clears after Send / Start Build / Run Workflow.
- **Windows CLI detection fixes.** cmd.exe shim quoting; auth-status heuristic no longer
  false-flags a logged-in CLI.
- **Direction adopted** (docs/ORCHESTRATION_PLAN.md): approval-gate orchestration engine;
  Work Mode tabled; no ollama runtime for now.

## 0.1.0 — 2026-06-12

- **Operating modes:** Work / Copilot Native vs Personal / Local CLI, per-workspace,
  with a first-launch picker, guarded switching (typed confirmation Work → Personal),
  and mode-tagged transcript segments. No mixed mode.
- **Hard mode partition:** mode-bound provider registry (cross-mode providers are never
  constructed), per-mode profile validation, SafetyPolicy cross-partition blocks,
  WorkflowRunner mode validation with the separation guard, Model Advisor guard
  warnings.
- **Copilot integration:** custom agent generation (`.github/agents/*.agent.md`) with
  hash-based no-overwrite protection; honest capability detection (all direct
  agent-session flags false — no public API); `copilotNative` provider over
  `vscode.lm.selectChatModels`; `@agent-room` chat participant behind a default-off
  setting; `copilotAgentSession` disabled scaffold.
- **Local CLI hardening:** capability-driven degradation ladders (Claude stream-json →
  json → plain; Codex flag omission with cwd fallback), capability caching, dangerous
  flags blocked pre-spawn, canonical "not available" health strings.
- **Webview:** typing indicators, git branch, provider/timestamp badges, copy/reply
  actions, diagnostics hidden behind a toggle, Copilot capability panel, strict CSP and
  message validation for all 26 allowed message types.
- **Model & effort:** tier → concrete model resolution per mode
  (`agentRoom.models.work.*` / `agentRoom.models.personal.*`), advisory effort levels
  plumbed end to end, confirmation before deep-reasoning/high/max effort.
- **Transcripts:** every message records mode, provider, roles, model tier/name,
  effort, workflow, timestamps; Markdown/JSON exports include the metadata.
- **Engine:** VS Code floor raised to 1.91 with `@types/vscode` pinned exactly.

## 0.0.1

- Initial Agent Room prototype.
- Professional VS Code-native shared chat room.
- Provider model for Claude Code CLI and Codex CLI.
- Optional OpenAI Web Search provider scaffold.
- Virtual team members: Atlas, Forge, Sentinel, Gauge, Scout, Conductor.
- Role assignment system.
- Built-in workflows.
- Model Advisor.
- Health checks.
- Transcript storage and export.
- Conservative safety defaults.
- No terminal spam by default.
