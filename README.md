# Agent Room

Agent Room is a VS Code extension that opens a shared coding-team room inside VS Code.
The room coordinates named virtual team members — Atlas, Forge, Sentinel, Gauge, Scout,
and the Conductor — backed by either company-approved GitHub Copilot capabilities
(Work Mode) or your local Claude Code and Codex CLI logins (Personal Mode).

## What Agent Room Is

A professional, role-based multi-agent command center for a workspace. It keeps the
transcript in a webview, runs provider CLIs as background child processes, hides raw
diagnostics by default, and routes work through team roles and workflows.

## What It Is Not

Agent Room is not a terminal screen scraper, a Copilot Chat scraper, a Copilot UI
automation tool, a ChatGPT browser automation tool, a direct Anthropic API client, or a
hosted proxy. It never uses private VS Code APIs and never bypasses your organization's
Copilot policy. It does not require API keys for local Claude or Codex usage.

## The Two Operating Modes (and why there is no mixed mode)

Mode separation is a feature, not a limitation. Each workspace is in exactly one mode:

- **Work / Copilot Native** (`workCopilotNative`) — uses only company-approved GitHub
  Copilot capabilities through official public VS Code APIs. Your employer's code never
  reaches your personal AI accounts.
- **Personal / Local CLI** (`personalLocal`) — uses your local Claude Code and Codex CLI
  logins, plus optional user-owned OpenAI web research. No GitHub Copilot dependency.

There is **no hybrid mode**. The partition is enforced at the lowest layer: the provider
registry for a mode never even constructs providers from the other side, so no code
path, fallback, or workflow step can reach them. If something asks for a provider from
the other side, Agent Room shows a clear explanation instead of silently substituting.
See [docs/MODE_SEPARATION.md](docs/MODE_SEPARATION.md).

Mode is chosen on first launch per workspace and can be changed only via
**Agent Room: Switch Operating Mode**. Switching Work → Personal requires a typed
confirmation, closes active provider sessions, and starts a new mode-tagged transcript
segment.

## Authentication Model

- **Work Mode:** the company-approved GitHub Copilot / Copilot Chat sign-in. Agent Room
  never asks for personal Anthropic/OpenAI keys in Work Mode.
- **Personal Mode:** Claude auth is your local `claude` CLI login; Codex auth is your
  local `codex` CLI login; Scout (optional) uses your own OpenAI API key, read from an
  environment variable or VS Code secret storage — never stored in transcripts or logs.

## Default Team

| Agent | Roles | Personal provider | Work provider | Effort |
|---|---|---|---|---|
| **User** | Product Owner, Final Approver | human | human | — |
| **Atlas** | Planner, Architect, Explainer | claudeCodeCli | copilotNative | high |
| **Forge** | Coder, Documentation Writer | claudeCodeCli | copilotNative | high |
| **Sentinel** | Reviewer, Security Auditor, Code Quality Auditor | codexCli | copilotNative | high |
| **Gauge** | Tester, DevOps Reviewer | codexCli | copilotNative | medium |
| **Scout** | Web Researcher, Source Checker, Documentation Finder, Current Info Verifier | openAiWebSearch (disabled until configured) | copilotCustomAgent | — |
| **Conductor** | Moderator, Workflow Coordinator, Transcript Summarizer, Safety Gatekeeper, Model Advisor | internalConductor | internalConductor | — |

## Providers vs Virtual Agents vs Roles

- A **provider** is a backend that can run a turn (Claude Code CLI, Codex CLI, Copilot
  Native, OpenAI Web Search, the human, the internal Conductor).
- A **virtual agent** is a named team member backed by one provider.
- A **role** is a responsibility (Planner, Coder, Reviewer, …). Any agent can hold zero,
  one, or many roles; a role can be held by several agents.

**Shared provider usage pools:** several agents can share one provider login. In
Personal Mode, Atlas and Forge both run through your Claude Code login; Sentinel and
Gauge both run through your Codex login. Heavy use by one team member draws on the same
account quota as the others.

## Model and Effort Selection

Model tiers (`fast`, `balanced`, `deepReasoning`, `coding`, `review`, `testing`,
`research`) map to concrete models through the `agentRoom.models.work.*` and
`agentRoom.models.personal.*` settings. Empty values mean "use provider default" —
Agent Room never invents model availability. Effort levels (`low`–`max`) are passed to
providers as advisory prompt instructions where no real effort control exists. By
default, deep-reasoning tiers and high/max effort ask for confirmation before running
(`agentRoom.modelAdvisor.confirmBeforeDeepReasoning`).

## Workflows

Built-in: Manual · Planning Only · Plan → Review · Plan → Review → Code · Code → Review
· Security Review · Test Review · Research → Plan → Review → Code · Full Build Cycle ·
Roundtable · Adversarial Review · Documentation Pass · Claim Verification · Copilot
Custom Agent Sync · Mode Setup / Provider Check. If a required role is unassigned, the
workflow is blocked with a helpful message — Agent Room never silently picks an
unassigned agent and never substitutes providers across the mode partition.

## Model Advisor

The Conductor classifies each request and recommends a workflow, agents, model tiers,
effort, and safety mode. It is advisory by default (`autoApply` is false); Apply in the
webview is the explicit confirmation. In Work Mode it never suggests local CLI
providers — it emits the separation guard instead.

## Copilot Integration

- **Custom agent generation (works today):** generates five `.github/agents/*.agent.md`
  files describing your team for Copilot. Files carry a content hash; Agent Room never
  overwrites a hand-edited file without confirmation. Commands: Generate / Preview /
  Open Folder.
- **`@agent-room` chat participant:** available behind
  `agentRoom.copilotIntegration.registerChatParticipant` (default off). It explains
  room state, recommends workflows, and offers buttons — it never reads the Copilot
  conversation or controls Copilot internals.
- **Direct Copilot Agent Session orchestration is not supported:** it is not exposed
  through public APIs in this environment. Agent Room can still generate Copilot custom
  agents and use approved Work Mode features. The `copilotAgentSession` provider exists
  only as a disabled, capability-gated scaffold. See
  [docs/COPILOT_INTEGRATION.md](docs/COPILOT_INTEGRATION.md).

## Optional Scout / Web Research

Disabled by default. Personal Mode only (unless your company explicitly approves an
official capability). Uses your own OpenAI API key, cites sources, never scrapes
chatgpt.com, never automates a browser, and never sends your code to the web
automatically.

## Context Chips

Selection, current file, and git status chips control exactly what editor context is
attached to a turn. The full repository is never included automatically, and prompts
are clamped to `agentRoom.maxPromptChars`.

## Safety Model

Conservative by default: no visible terminals, no shell-string spawning, no screen
scraping, no UI automation, no private APIs, no org-policy bypass, no secrets in logs or
transcripts (diagnostics are redacted), no dangerous/yolo/bypass CLI flags unless
dangerous mode is explicitly enabled *and* selected *and* confirmed. Safety modes:
read-only, workspace write with approval, and an off-by-default dangerous mode. The
human is always the Final Approver.

## Transcript Storage and Export

Transcripts live in memory, the workspace (`.agent-room/transcripts/`, git-ignored), or
global storage. Every message records operating mode, provider, virtual agent, roles,
model tier/name when known, effort, workflow, timestamp, status, and redacted
diagnostics. Export to Markdown (reads like a professional conversation) or JSON.

## Settings

All settings live under `agentRoom.*` in VS Code settings — operating mode, per-mode
enablement, CLI executables, workflow defaults, prompt/transcript budgets, timeouts,
safety, model tier mappings (`models.work.*`, `models.personal.*`), Model Advisor
behavior, web research, and `copilotIntegration.*`. Run **Agent Room: Open Settings**.

## Prerequisites

- VS Code 1.91 or newer
- Node.js 20 or newer
- Personal Mode: local `claude` and/or `codex` CLIs, already authenticated
- Work Mode: GitHub Copilot + Copilot Chat extensions, signed in under your org policy

## Troubleshooting

- *"Claude Code is not available. Run `claude` once in a terminal to finish setup."* —
  install/log into the Claude CLI, then run **Agent Room: Check CLI Health**.
- *"Codex is not available. Run `codex` once in a terminal to finish setup."* — same,
  with the `codex` CLI.
- *"This model or agent is not available under your organization's GitHub Copilot
  policy."* — your org does not expose that model/agent; pick another or ask your admin.
- No Copilot models in Work Mode — install and sign in to GitHub Copilot Chat; run
  **Agent Room: Check Copilot Integration Capabilities** for an honest report.
- Workflow blocked — open Room Setup and assign the missing role.

## Windows Notes

npm-installed CLIs are `.cmd` shims that Node cannot spawn without a shell since the
CVE-2024-27980 hardening. Agent Room uses an audited `cmd.exe /d /s /c` fallback for
those shims only, with strict argument handling — never shell-concatenated strings.

## WSL Notes

If your CLIs live inside WSL, run VS Code with the WSL remote extension so the
extension host (and the spawned CLIs) run inside WSL. Pointing
`agentRoom.claude.executable` at a Windows-side path while the CLI lives in WSL will
fail health checks.

## Known Limitations

- Work Mode model execution depends entirely on which chat models your organization
  exposes via Copilot; none exposed means turns fail honestly with the policy string.
- `copilotCustomAgent` represents generated files only — invoking those agents happens
  inside Copilot Chat, not from Agent Room.
- Direct Copilot Agent Session orchestration is unsupported (no public API).
- Reactions on messages are recorded in the data model but have no UI yet.

## Roadmap

Capability-gated direct session support if public APIs ever allow it; richer webview
panels (presence, per-message reactions); custom workflow editor UI.

## Manual Test Checklist

1. `npm install && npm run compile && npm test && npm run lint` — all green.
2. F5 launch → first-run mode picker appears; pick Personal Mode.
3. Check CLI Health → honest canonical strings if CLIs are missing.
4. Send a prompt → advisor recommendation appears; Apply runs the workflow; typing
   indicator shows "Atlas is planning…".
5. Switch Operating Mode → switching back to Personal from Work demands the typed
   confirmation; a new mode-tagged transcript segment starts.
6. Work Mode → Copilot panel shows capability flags; all agent-session flags read "no".
7. Generate Copilot Custom Agents → five files in `.github/agents/`; edit one by hand;
   regenerate → the edited file is kept unless you confirm overwriting.
8. Export transcript as Markdown → messages show mode/provider/model/effort metadata.
9. Verify the webview in both dark and light themes.
