# Changelog

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
