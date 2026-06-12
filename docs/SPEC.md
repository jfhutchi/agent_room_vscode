# Agent Room — Product & Engineering Specification

Repo: `jfhutchi/agent_room_vscode` · Product: **Agent Room**
A VS Code-native multi-agent coding room where Claude Code and Codex collaborate as a role-based development team.

This document is the source of truth for what Agent Room must become. It is implemented
**in phases across multiple agent sessions** (see `PROMPTS.md`), never in one run.

---

## 0. Authority & Conflict Resolution

These rules override everything else in this spec:

1. **The repo is reality; the spec is intent.** Inspect, compile, and test the existing code
   before changing it. Where the repo's existing architecture conflicts with this spec,
   prefer the repo's structure unless it is demonstrably broken — and document every
   deviation (either direction) in `docs/SPEC_DEVIATIONS.md` with a one-paragraph reason.
2. **Do not start over.** Do not delete the current architecture unless it is broken, and
   if so, document exactly why in `SPEC_DEVIATIONS.md` before deleting.
3. **Honest false beats fake true.** Never claim a capability, model, API, or integration
   works unless verified in this environment. Never claim success if compile/test/lint fail.
4. **Verify APIs against the installed typings, not memory.** Claims about VS Code API
   availability (Chat Participant API, `vscode.lm` / Language Model API, agent sessions)
   must be checked against `node_modules/@types/vscode` and the `engines.vscode` version
   in `package.json`. If the typings don't expose it, the capability flag is `false`.
5. **Do not delete failing tests to pass.** Fix the code or fix the test with justification.

---

## 1. Product Vision

Agent Room is a professional VS Code-native multi-agent coding room. The user coordinates
named virtual team members in one shared chat room, with role-based workflows (plan,
architect, code, review, test, security audit, document, source-check, research, summarize).

Two first-class operating modes, hard-partitioned from each other:

| Mode | Backing | Best for |
|---|---|---|
| **Work / Copilot Native** | Company-approved GitHub Copilot capabilities only. No personal API keys or personal Claude/OpenAI logins. Respects org policy. | Enterprise/work repos |
| **Personal / Local CLI** | User's local Claude Code CLI login + local Codex CLI login; optional user-owned OpenAI API key for web research. | Personal projects |

**There is deliberately no mixed/hybrid mode.** Sending employer code to personal AI
accounts (or personal code through employer Copilot seats) can violate employment
agreements, data-handling policy, and customer contracts — it is a fireable offense in
many organizations. Agent Room therefore enforces a **hard partition**: a workspace is in
exactly one mode, and providers from the other mode are not merely hidden but
**unregistered and unreachable** in that workspace. This separation is a core product
feature, not a limitation. See §3.4.

### Core vocabulary

- **Provider** — a backend capability (e.g., `claudeCodeCli`).
- **Virtual agent** — a named teammate in the room (e.g., Forge).
- **Role** — a responsibility assigned to a virtual agent (e.g., Coder).
- **Workflow** — a sequence of role-based turns.

---

## 2. Quality Bar

Must look and feel like a first-party VS Code tool: compact, professional, theme-aware,
accessible, native. Something a senior engineer would leave open all day.

Must NOT look like: a college project, toy chatbot, web dashboard, Discord clone, flashy
AI demo, terminal log wrapper, Bootstrap student app, or colorful SaaS chat clone.

Hard behavioral bars (always, in every phase):

- No terminal spam; no visible terminals for normal Claude/Codex execution.
- No terminal screen-scraping. No Copilot Chat scraping. No Copilot UI automation.
- No private VS Code APIs. No organization policy bypass.

---

## 3. Operating Modes

### 3.1 Setting and visibility

Required setting `agentRoom.operatingMode` with values `workCopilotNative |
personalLocal`, default `personalLocal` (unless first-launch picker is enabled). Selected mode is
stored **per workspace** and always visible in the webview header:

- `Agent Room — Work Mode` / *Using company-approved GitHub Copilot providers.*
- `Agent Room — Personal Mode` / *Using local Claude Code and Codex CLI providers.*

### 3.2 Work Mode rules

Must use only: company-approved Copilot auth, company-exposed Copilot models,
company-enabled third-party agents, company-approved Copilot features, official
VS Code/GitHub public APIs.

Must NOT: ask for personal Anthropic/OpenAI API keys or Claude.ai/ChatGPT logins; silently
use personal Claude Code CLI, Codex CLI, or OpenAI Web Research; bypass org policy; scrape
Copilot Chat; automate Copilot UI; use private APIs; send company code to personal
providers; pretend unsupported Copilot direct orchestration works.

Must detect and display: Copilot extension detected/not; Copilot Chat available/not;
custom agents supported/not; third-party agents available/not; Claude agent
enabled/blocked/unknown; Codex agent enabled/blocked/unknown; model list available/not;
direct Agent Session orchestration available/not; org policy limitations if detectable.

Canonical user-facing limitation strings:

> "This model or agent is not available under your organization's GitHub Copilot policy."

> "Direct Copilot Agent Session orchestration is not exposed through public APIs in this
> environment. Agent Room can still generate Copilot custom agents and use approved Work
> Mode features."

### 3.3 Personal Mode rules

May use: local Claude Code CLI, local Codex CLI, optional user-owned OpenAI API key for
Web Research, internal Conductor. Claude auth = local Claude Code CLI login; Codex auth =
local Codex/OpenAI CLI login; Scout = user's own OpenAI key only if Web Research enabled.
No GitHub Copilot dependency.

Must NOT: use company Copilot credentials; pretend personal providers are
company-approved; store API keys in transcripts; log secrets; send code to web research
automatically; scrape chatgpt.com; automate ChatGPT UI.

Must show: Claude Code CLI health, Codex CLI health, Scout/Web Research health, local CLI
path issues, "authentication likely required" messages.

### 3.4 Mode Separation Enforcement (replaces any notion of a mixed mode)

The Work/Personal partition is enforced in code, at the lowest layer, not just in the UI:

- **Registry-level partition.** ProviderRegistry only constructs and registers providers
  whose `supportedModes` includes the workspace's current mode. In Work Mode, the
  personal providers (`claudeCodeCli`, `codexCli`, `openAiWebSearch`) do not exist as
  objects — there is no code path, fallback, or workflow step that can reach them. The
  inverse holds for Copilot providers in Personal Mode.
- **Guarded mode switching.** `Agent Room: Switch Operating Mode` is the only way to
  change mode. Switching Work → Personal in a workspace that has ever been in Work Mode
  requires an explicit typed confirmation and shows: *"Switching to Personal Mode will
  route this workspace's code to your personal AI accounts. Only do this if this
  repository is yours. Sending employer code to personal providers may violate your
  employment agreement."* Switching also closes active provider sessions and starts a
  new transcript segment tagged with the new mode.
- **Provider identity on every message.** Every transcript message carries its mode and
  provider badge, so a transcript can never ambiguously interleave modes.
- **No silent provider substitution, ever.** If a workflow's required provider is
  unavailable in the current mode, show a helpful system message; never fall back across
  the partition.
- Never bypass Copilot org policy; never use private APIs.

### 3.5 Per-mode profiles

Stored under `.agent-room/profiles/`: `work-profile.json` and `personal-profile.json`.
Each profile only references providers valid for its mode; loading a profile that names a
cross-mode provider is a validation error, not a silent remap. **Never store secrets in
profiles.**

### 3.6 First-launch mode picker

On first launch per workspace, show a professional VS Code-native picker:

> **Choose Agent Room mode for this workspace**
> 1. **Work / Copilot Native** — Use company-approved GitHub Copilot capabilities only. Best for enterprise repositories.
> 2. **Personal / Local CLI** — Use your local Claude Code and Codex CLI logins. Best for personal projects.

Buttons: *Use Work Mode · Use Personal Mode · Learn More*. The picker must state that the
two modes are fully separated and that mode can be changed later only via
`Agent Room: Switch Operating Mode`.
Store per workspace; never ask again unless the user runs `Agent Room: Switch Operating Mode`.

---

## 4. Provider Model

```ts
type ProviderKind = "localCli" | "apiResearch" | "copilot" | "human" | "internal";
```

| Provider id | Kind | Modes (default) | Notes |
|---|---|---|---|
| `claudeCodeCli` | localCli | Personal | exec default `claude`; local login; no API key; background child process; no visible terminal; no scraping |
| `codexCli` | localCli | Personal | exec default `codex`; local login; no API key; background child process; no visible terminal; no scraping |
| `openAiWebSearch` | apiResearch | Personal only (disabled by default) | user-owned OpenAI key; never scrapes chatgpt.com; never automates browser; Work Mode only if explicitly company-approved |
| `copilotNative` | copilot | Work (primary) | official GitHub Copilot / VS Code capabilities; public APIs only; respects org policy |
| `copilotCustomAgent` | copilot | Work | represents generated `.github/agents/*.agent.md`; implement now; does not imply direct session control |
| `copilotAgentSession` | copilot | (disabled) | future/direct provider; enabled only if public APIs verifiably support direct orchestration; no private APIs, no scraping, no fake implementation |
| `human` | human | all | the user |
| `internalConductor` | internal | all | moderator/coordinator |

```ts
interface Provider {
  id: string;
  displayName: string;
  kind: ProviderKind;
  enabled: boolean;
  supportedModes: OperatingMode[];
  healthCheck(): Promise<ProviderHealth>;
  runTurn(invocation: ProviderInvocation): Promise<ProviderResult>;
}
```

`ProviderInvocation` must include: providerId, virtualAgentId, operatingMode, prompt,
workspaceRoot, safetyMode, modelTier, concreteModelName (if available), effortLevel,
timeoutMs, context, abortSignal.

`ProviderResult` must include: providerId, virtualAgentId, operatingMode, status,
finalText, diagnostics, durationMs, fallbackUsed, warnings.

---

## 5. Virtual Team, Roles, Defaults

One canonical default team, with the provider varying by mode:

| Agent | Roles | Personal provider | Work provider | Effort |
|---|---|---|---|---|
| **User** | Product Owner, Final Approver | human | human | — |
| **Atlas** | Planner, Architect, Explainer | claudeCodeCli | copilotNative / copilotCustomAgent (approved reasoning/planning model) | high |
| **Forge** | Coder, Documentation Writer | claudeCodeCli | copilotNative / copilotCustomAgent (approved coding model, or approved Codex/Claude agent if available) | high |
| **Sentinel** | Reviewer, Security Auditor, Code Quality Auditor | codexCli | copilotNative / copilotCustomAgent (approved review/reasoning model) | high |
| **Gauge** | Tester, DevOps Reviewer | codexCli | copilotNative / copilotCustomAgent (approved balanced/testing model) | medium |
| **Scout** | Web Researcher, Source Checker, Documentation Finder, Current Info Verifier | openAiWebSearch (disabled until configured) | approved Copilot web/docs/search capability only if org allows; otherwise disabled | — |
| **Conductor** | Moderator, Workflow Coordinator, Transcript Summarizer, Safety Gatekeeper, Model Advisor | internalConductor | internalConductor | — |

Team system must support: one agent with multiple roles; one role on multiple agents;
custom roles (create/edit/delete); restoring defaults; per-mode profiles; profile
import/export.

### Built-in roles

Product Owner, Final Approver, Planner, Architect, Explainer, Coder, Reviewer, Tester,
Security Auditor, Code Quality Auditor, DevOps Reviewer, Documentation Writer, Web
Researcher, Source Checker, Documentation Finder, Current Info Verifier, Moderator,
Workflow Coordinator, Transcript Summarizer, Safety Gatekeeper, Model Advisor.

Each role: `id`, `name`, `description`, `instructions`, `isBuiltIn`.

---

## 6. Model Tiers, Effort, Model Advisor

```ts
type ModelTier = "providerDefault" | "fast" | "balanced" | "deepReasoning"
              | "coding" | "review" | "testing" | "research" | "userSelected";
type EffortLevel = "low" | "medium" | "high" | "max";
```

Rules: never invent model availability or pricing; never claim a model is available
unless detected or configured; Work Mode uses only company-exposed models; Personal Mode
uses local provider defaults unless the user maps tiers; if a provider supports explicit
effort/reasoning controls, map effort to them, otherwise pass effort as advisory prompt
instruction; show confirmation before deep/high/max effort when settings require it.
Empty model settings mean "use provider default."

### Model Advisor

Advisory by default (`autoApply` defaults false). Recommends based on task category, mode,
role/provider/model availability, and safety. Task categories: quickQuestion,
codeExplanation, planning, architecture, implementation, debugging, refactor, testing,
securityReview, documentation, webResearch, claimVerification, fullBuildCycle,
adversarialReview, copilotCustomAgentGeneration, copilotIntegrationCheck,
operatingModeSelection.

A recommendation includes: operating mode, workflow, virtual agents, roles, providers,
model tiers, effort levels, context mode, safety mode, warnings, confirmation
requirements. Example phrasings:

- Work: "This looks like a full build task in a work repository. I recommend Work Mode
  with Atlas for planning, Forge for coding, Sentinel for security review, and Gauge for
  tests using company-approved Copilot models."
- Personal: "This looks like a personal implementation task. I recommend Atlas and Forge
  through Claude Code CLI, then Sentinel and Gauge through Codex CLI."
- Separation guard: "This workspace is in Work Mode. Local Claude Code and Codex
  providers are unavailable here by design. If this is a personal repository, use
  Agent Room: Switch Operating Mode."

---

## 7. Copilot Integration (three levels)

**Level 1 — Custom Agent Generation (implement now).** Generate workspace files under
`.github/agents/` (configurable): `atlas-planner.agent.md`, `forge-coder.agent.md`,
`sentinel-reviewer.agent.md`, `gauge-tester.agent.md`, `scout-researcher.agent.md`.
Each file includes: agent name, description, role instructions, expected behavior, safety
rules, handoff guidance, expected output format, relationship to the Agent Room virtual
team member. Never overwrite user-edited files without confirmation. Support: preview,
write, update, skip-modified, open folder.

**Level 2 — Agent Room Chat Participant (implement only if the public VS Code Chat
Participant API supports it safely — verify per §0.4).** Invoked as `@agent-room`. May:
open Agent Room, explain current state, recommend a workflow, route selected context to
Agent Room, generate custom agents. Must not: pretend to control Copilot internals,
invoke private Copilot APIs, or read the Copilot transcript unless public APIs support it.

**Level 3 — Direct Copilot / Agent HQ Session Provider (capability-gated scaffold
only).** `copilotAgentSession` stays disabled unless public APIs verifiably support
invoking Copilot agent sessions, invoking third-party Claude/Codex agent sessions,
reading transcripts/results, and rendering results in the Agent Room webview. If
unsupported, show the canonical limitation string from §3.2. Do not fake. Do not scrape.
Do not automate the UI. No private APIs.

### Capability detection

`src/core/CopilotIntegration.ts` + `src/core/CopilotCustomAgentGenerator.ts`.

```ts
interface CopilotIntegrationCapabilities {
  available: boolean;
  copilotExtensionDetected: boolean;
  copilotChatDetected: boolean;
  canCreateCustomAgents: boolean;            // true if workspace files can be generated
  canRegisterChatParticipant: boolean;       // true only via public VS Code API (verify typings)
  canInvokeCopilotAgentSession: boolean;     // false unless public API verified
  canInvokeThirdPartyAgentSession: boolean;  // false unless public API verified
  canReadAgentSessionTranscript: boolean;    // false unless public API verified
  canRenderAgentSessionInCustomWebview: boolean; // false unless public API verified
  canManageCopilotCliSessions: boolean;      // false unless public API verified
  limitations: string[];
  checkedAt: string;
}
```

Prefer honest `false` over fake `true`. Verification = `node_modules/@types/vscode`
against `engines.vscode` (§0.4), plus runtime extension detection
(`vscode.extensions.getExtension`).

---

## 8. Local CLI Providers

**ClaudeCodeProvider** (`claude` by default). `child_process.spawn` with args arrays; no
shell string concatenation; no visible terminal; no terminal scraping. Capability
detection via `claude --help`: detect `-p`/`--print`, `--output-format`, `stream-json`,
`json`; degrade gracefully. Command patterns: `claude -p "<prompt>"`,
`claude -p --output-format stream-json "<prompt>"`, `claude -p --output-format json "<prompt>"`.

**CodexCliProvider** (`codex` by default). Preferred when supported:
`codex exec --cd <workspaceRoot> --sandbox workspace-write --ask-for-approval on-request --json -`
Fallbacks: omit unsupported flags; use `cwd` if `--cd` unsupported; omit `--json` and
parse plain text if needed. Never use dangerous/yolo/bypass flags by default. Never
modify global Codex config unless the user explicitly asks.

---

## 9. OpenAI Web Research Provider

`openAiWebSearch` (agent: Scout). Optional, **disabled by default**. Do not call it
"ChatGPT Web" internally. Personal Mode: enabled by user-owned API key. Work Mode:
disabled unless explicitly company-approved official capability exists.

Rules: never scrape chatgpt.com; never automate a browser; never rely on a consumer
ChatGPT session; never use the extension author's account; never store the API key in a
transcript; never log the API key; never send private source code to the web
automatically; cite sources when enabled; hide raw API JSON in diagnostics.

---

## 10. Workflows

Built-in: Manual · Planning Only · Plan → Review · Plan → Review → Code · Code → Review ·
Security Review · Test Review · Research → Plan → Review → Code · Full Build Cycle ·
Roundtable · Adversarial Review · Documentation Pass · Claim Verification · Copilot
Custom Agent Sync · Mode Setup / Provider Check.

Rules: if a required role is missing, show a helpful system message — never silently pick
an unassigned agent; never ask agents to code if no Coder is assigned; never use Scout if
disabled; never use a personal provider in Work Mode; never use the direct Copilot
session provider unless capability is confirmed.

---

## 11. PromptBuilder

Every provider turn includes: Agent Room identity, operating mode, virtual agent
identity, provider identity, assigned roles + role instructions, workflow name + step,
safety mode, model tier, effort level, workspace context, git context / current file /
current selection (if selected), transcript context, provider/mode warnings, latest user
message, expected output format.

Embedded prompt rules: be honest about what you can and cannot see; do not pretend to
communicate with other agents outside the transcript; do not claim file changes unless
actually changed — list exact files when changed; do not expose secrets or print
environment variables; no destructive actions unless explicitly requested and allowed;
in Work Mode, no personal-provider assumptions; always state provider identity; never claim direct Copilot control unless capability confirms it.

Enforce `maxPromptChars`. Never include the full repo automatically.

---

## 12. Webview UI & Security

**Layout.** Header: title, operating mode badge, workspace name, git branch, provider
health indicators, current workflow, safety mode. Compact command bar: workflow selector,
model advisor indicator, context indicator, room setup toggle, diagnostics toggle,
Copilot integration toggle. Main transcript: compact professional message list (no giant
bubbles, no raw logs by default), participant/provider/role badges, timestamps,
copy/reply/diagnostics actions. Composer: multiline input, Send, route buttons, Run
Workflow, Stop, Clear, Export. Collapsible panels: Room Setup, Team Members, Role Matrix,
Model Advisor, Context, Diagnostics, Transcript Options, Operating Mode, Copilot
Integration. First screen reads as a clean chat room, not a settings page.

**Style.** VS Code CSS variables only. No external fonts, no CDN, no neon gradients, no
huge cards, no cartoon icons, no random colors, no heavy shadows, no glassmorphism.
Verify in dark and light themes. Accessible (keyboard navigation, ARIA where relevant,
contrast via theme variables).

**Typing indicators.** "Atlas is planning…", "Forge is coding…", "Sentinel is
reviewing…", "Gauge is checking tests…", "Scout is researching…", "Conductor is
summarizing…".

**Friendly system messages** (canonical strings): the two §3.2 strings, plus
"Claude Code is not available. Run `claude` once in a terminal to finish setup." and
"Codex is not available. Run `codex` once in a terminal to finish setup."

**Security.** Strict CSP with nonce; local CSS/JS only; no remote scripts/CSS/fonts; no
unsafe `innerHTML` — DOM APIs for user/agent text; validate all webview messages; never
send environment variables or secrets to the webview.

**Allowed webview message types** (reject unknown/malformed): ready, sendMessage,
sendToVirtualAgent, sendToRole, runWorkflow, stop, clearTranscript, exportTranscript,
checkHealth, switchOperatingMode, updateUiState, toggleContextChip, updateRoleAssignment,
saveRoomProfile, restoreDefaultProfile, exportRoomProfile, importRoomProfile,
createCustomRole, updateCustomRole, deleteCustomRole, applyModelAdvisorRecommendation,
ignoreModelAdvisorRecommendation, checkCopilotCapabilities, generateCopilotCustomAgents,
previewCopilotCustomAgents, openCopilotCustomAgentsFolder.

---

## 13. Child Process Runner

`child_process.spawn`; args as arrays; never `shell: true`; never shell-concatenate.
Capture stdout/stderr separately; support stdin, timeout, cancellation (Stop button +
AbortSignal); normalize line endings; redact secrets; truncate huge diagnostics; never
log environment variables.

---

## 14. Transcript Storage

Storage targets: memory, workspace, global. Workspace layout:

```
.agent-room/
  README.md
  .gitignore
  transcripts/
  profiles/        # work-profile.json, personal-profile.json
  workflows/
  cache/
```

Each transcript message records: operating mode, provider, virtual agent, roles used,
model tier or model name if known, effort level, workflow, timestamp, content,
diagnostics, status. Export to Markdown (reads like a professional conversation, not raw
logs) and JSON.

---

## 15. Settings (package.json `contributes.configuration`)

| Key | Type / enum | Default |
|---|---|---|
| agentRoom.operatingMode | workCopilotNative \| personalLocal | personalLocal |
| agentRoom.firstLaunch.showModePicker | boolean | true |
| agentRoom.workMode.enabled | boolean | true |
| agentRoom.personalMode.enabled | boolean | true |
| agentRoom.modeSeparation.requireTypedConfirmationOnSwitch | boolean | true |
| agentRoom.claude.executable | string | claude |
| agentRoom.codex.executable | string | codex |
| agentRoom.defaultWorkflow | string | manual |
| agentRoom.defaultContextMode | string | lastMessages |
| agentRoom.lastMessagesCount | number | 10 |
| agentRoom.maxTranscriptChars | number | 60000 |
| agentRoom.maxPromptChars | number | 120000 |
| agentRoom.agentTimeoutSeconds | number | 600 |
| agentRoom.healthCheckTimeoutSeconds | number | 10 |
| agentRoom.claude.preferStreamJson | boolean | true |
| agentRoom.claude.preferJson | boolean | true |
| agentRoom.codex.useJson | boolean | true |
| agentRoom.codex.sandbox | read-only \| workspace-write | workspace-write |
| agentRoom.codex.approval | untrusted \| on-request \| never | on-request |
| agentRoom.enableDangerousModes | boolean | false |
| agentRoom.transcriptStorage | memory \| workspace \| global | workspace |
| agentRoom.roomProfileStorage | workspace \| global | workspace |
| agentRoom.showRawAgentEvents | boolean | false |
| agentRoom.extraRoomInstructions | string | "" |
| agentRoom.logging.level | error \| info \| debug \| trace | error |
| agentRoom.modelAdvisor.enabled | boolean | true |
| agentRoom.modelAdvisor.autoApply | boolean | false |
| agentRoom.modelAdvisor.confirmBeforeDeepReasoning | boolean | true |
| agentRoom.modelAdvisor.preferLowerCost | boolean | true |
| agentRoom.modelAdvisor.preferSpeed | boolean | false |
| agentRoom.modelAdvisor.preferQuality | boolean | false |
| agentRoom.models.work.providerDefault / .fast / .balanced / .deepReasoning / .coding / .review / .testing | string | "" |
| agentRoom.models.personal.claude.fast / .balanced / .deepReasoning / .coding | string | "" |
| agentRoom.models.personal.codex.fast / .balanced / .deepReasoning / .coding | string | "" |
| agentRoom.models.personal.webResearch.research | string | "" |
| agentRoom.webResearch.enabled | boolean | false |
| agentRoom.webResearch.apiKeySource | environment \| vscodeSecretStorage | environment |
| agentRoom.webResearch.apiKeyEnvironmentVariable | string | OPENAI_API_KEY |
| agentRoom.webResearch.maxResults | number | 5 |
| agentRoom.webResearch.requireCitations | boolean | true |
| agentRoom.copilotIntegration.enabled | boolean | true |
| agentRoom.copilotIntegration.generateCustomAgents | boolean | true |
| agentRoom.copilotIntegration.customAgentsDirectory | string | .github/agents |
| agentRoom.copilotIntegration.registerChatParticipant | boolean | false |
| agentRoom.copilotIntegration.enableDirectAgentSessions | boolean | false |
| agentRoom.copilotIntegration.requirePublicApisOnly | boolean | true |
| agentRoom.copilotIntegration.neverScrapeCopilotUi | boolean | true |

Empty model strings mean "use provider default."

---

## 16. Commands (package.json ↔ registerCommands.ts must match)

| Command id | Title |
|---|---|
| agentRoom.open | Agent Room: Open |
| agentRoom.switchOperatingMode | Agent Room: Switch Operating Mode |
| agentRoom.checkCliHealth | Agent Room: Check CLI Health |
| agentRoom.checkCopilotCapabilities | Agent Room: Check Copilot Integration Capabilities |
| agentRoom.openRoomSetup | Agent Room: Open Room Setup |
| agentRoom.resetRoleAssignments | Agent Room: Reset Role Assignments |
| agentRoom.exportRoomProfile | Agent Room: Export Room Profile |
| agentRoom.importRoomProfile | Agent Room: Import Room Profile |
| agentRoom.sendSelectionToAssignedPlanner | Agent Room: Send Current Selection to Assigned Planner |
| agentRoom.sendSelectionToAssignedCoder | Agent Room: Send Current Selection to Assigned Coder |
| agentRoom.sendSelectionToAssignedReviewer | Agent Room: Send Current Selection to Assigned Reviewer |
| agentRoom.runPlanningWorkflowOnCurrentFile | Agent Room: Run Planning Workflow on Current File |
| agentRoom.runFullBuildCycleOnCurrentFile | Agent Room: Run Full Build Cycle on Current File |
| agentRoom.generateCopilotCustomAgents | Agent Room: Generate Copilot Custom Agents |
| agentRoom.previewCopilotCustomAgents | Agent Room: Preview Copilot Custom Agents |
| agentRoom.openCopilotCustomAgentsFolder | Agent Room: Open Copilot Custom Agents Folder |
| agentRoom.exportTranscript | Agent Room: Export Transcript |
| agentRoom.clearTranscript | Agent Room: Clear Transcript |
| agentRoom.openSettings | Agent Room: Open Settings |

---

## 17. Safety

Default posture: conservative. No terminal spam; no visible terminals for normal runs; no
screen scraping; no Copilot UI automation; no private APIs; no org policy bypass; no
personal providers in Work Mode; no automatic full-repo context; no secrets in logs; no
environment variable logging; no API keys in transcripts; no arbitrary command execution
from agent text; no dangerous/yolo/bypass by default; the human remains Final Approver.

Safety modes: `readOnly`, `workspaceWriteWithApproval`, `dangerousDisabled`, and
`dangerous` only if explicitly enabled and confirmed.

---

## 18. Test Requirements

OperatingMode: default mode; switch mode requires typed confirmation (Work → Personal);
per-workspace mode persistence; Work Mode blocks personal providers; Personal Mode uses
local providers; mode switch starts a new mode-tagged transcript segment.

ProviderRegistry: `supportedModes` respected; cross-mode providers are NOT REGISTERED
(absent from the registry, not merely disabled); loading a profile naming a cross-mode
provider fails validation.

CopilotIntegration: custom agent generation; no overwrite without confirmation;
capability detection returns false for unsupported direct APIs; limitations are clear.

PromptBuilder: includes mode, provider, roles, effort, workflow, warnings; excludes full
repo by default.

WorkflowRunner: role validation; mode validation; no personal provider in Work Mode; no
direct Copilot session unless supported.

ModelAdvisor: recommends Work Mode for enterprise/Copilot context; Personal for local
Claude/Codex context; emits the §6 separation guard instead of suggesting cross-mode
providers; recommends custom agent generation when relevant.

TranscriptStore: stores mode/provider/model/effort/roles per message.

SafetyPolicy: blocks Work Mode personal fallback; blocks dangerous mode by default;
blocks Copilot UI scraping/private APIs.

Webview validation: switchOperatingMode message; Copilot messages; malformed messages
rejected.

ChildProcess: args array; no shell string; timeout; cancellation; redaction.

Extension: activates; commands registered.

---

## 19. Documentation Deliverables

README.md must cover: what Agent Room is / is not; the two modes and why there is no
mixed mode (mode separation as a feature); authentication model; Work and Personal Mode
details; default teams per mode; providers vs virtual
agents vs roles; shared provider usage pools; model and effort selection; workflows;
Model Advisor; Copilot integration incl. custom agent generation and direct-session
limitations; optional Scout/Web Research; context chips; safety model; transcript storage
and export; settings; troubleshooting; Windows notes; WSL notes; known limitations;
roadmap; manual test checklist.

Additional docs: `docs/OPERATING_MODES.md`, `docs/COPILOT_INTEGRATION.md`,
`docs/WORK_MODE.md`, `docs/PERSONAL_MODE.md`, `docs/MODE_SEPARATION.md`,
`docs/SPEC_DEVIATIONS.md`. Prompts: `prompts/013-copilot-integration.md`,
`prompts/014-work-personal-modes.md`.

Docs must be honest. Never claim direct Copilot session orchestration works unless it
actually works through public APIs.

---

## 20. Verification Gate (every phase)

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
npm install
npm run compile
npm test
npm run lint
```

Manual checks when an Extension Development Host is available: F5 launches; `Agent Room:
Open` works; first-launch mode picker appears; all three modes selectable; header shows
mode; provider health works; Copilot capability panel works; custom agent generation
previews/writes safely; local CLI providers show friendly missing/auth messages; role
matrix works; workflows validate roles/mode; transcript export works; no terminal tabs
open; no raw logs in chat; UI is professional in dark and light themes. If manual launch
is impossible in the environment, say so honestly and provide compile/test/lint results.

---

## 21. Success Criteria

Successful only if: extension compiles; tests run; commands register; Agent Room opens;
UI looks professional; Work and Personal modes exist as real setting and UI choice with
a registry-level hard partition between them; Work Mode blocks personal providers;
Personal Mode uses local Claude/Codex; mode switching is guarded and confirmed; Copilot custom agent generation works or is honestly documented as deferred;
direct Copilot session control is capability-gated; no private APIs or UI scraping; no
terminal spam; role/team/workflow model is real; transcripts/export work; README matches
reality.
