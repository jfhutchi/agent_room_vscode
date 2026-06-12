# Agent Room — Session 0 Audit & Phase Plan

## Context

`docs/SPEC.md` defines what Agent Room must become: a VS Code multi-agent room with two
hard-partitioned operating modes (Work/Copilot-Native vs Personal/Local-CLI), Copilot
integration in three capability-gated levels, and a registry-level provider partition.
This session audits the existing repo against that spec (no code changes) and produces
the phase plan for the implementation sessions that follow. Headline: **the baseline is
already fully green**, the Personal-Mode core (providers, team, roles, workflows,
webview, transcripts) is real and tested, and **everything mode- and Copilot-related is
missing entirely** (zero occurrences of `operatingMode` or `copilot` in `src/`).

---

## 1. Baseline (real results, run in this session)

| Command | Result |
|---|---|
| `npm install` | ✅ exit 0 — "added 147 packages … found 0 vulnerabilities" |
| `npm run compile` (`tsc -p ./`) | ✅ exit 0, no output |
| `npm test` | ✅ exit 0 — `tests 35 / pass 35 / fail 0` (node --test) |
| `npm run lint` (`eslint src test`) | ✅ exit 0, no findings |

No failures to report. Phase 1 "green baseline" is already satisfied → merged into a
small housekeeping phase.

## 2. Subsystem Inventory

Files read: `src/core/{Types,ProviderTypes,ProviderRegistry,ClaudeCodeProvider,CodexCliProvider,OpenAiWebSearchProvider,RoleRegistry(partial),VirtualTeamRegistry,WorkflowRegistry(partial),WorkflowRunner,PromptBuilder,Conductor,ModelAdvisor,SafetyPolicy,TranscriptStore(partial),RoomProfileStore(partial),AgentRoomController(partial)}.ts`, `src/utils/{childProcess,validation}.ts`, `src/webview/{AgentRoomPanel,html}.ts`, `src/commands/{commandIds,registerCommands}.ts`, `src/extension.ts`, `package.json`, `PROMPTS.md`, test output for all of `test/`.

| Subsystem | Status | Evidence |
|---|---|---|
| Operating modes (§3) | **missing** | No `OperatingMode` type in `Types.ts`; no setting, picker, switch command; grep for `operatingMode|copilot` in `src/` = 0 hits |
| ProviderRegistry (§4) | implemented-and-working, **no mode partition** | `ProviderRegistry.ts` — plain Map, `register/get/all/runTurn`; no `supportedModes` anywhere |
| ClaudeCodeProvider (§8) | implemented-and-working, partial vs spec | `ClaudeCodeProvider.ts` — stdin prompt, `-p --output-format stream-json|json`, redaction, cancel; **healthCheck detects capabilities but `runTurn` never consults them** (no degradation ladder) |
| CodexCliProvider (§8) | implemented-and-working, partial vs spec | `CodexCliProvider.ts` — `exec --cd --sandbox --ask-for-approval --json -`; same gap: no fallback ladder when flags unsupported |
| OpenAiWebSearchProvider (§9) | implemented-and-working | `OpenAiWebSearchProvider.ts` — disabled by default, env/SecretStorage key, citation prompt, key never logged |
| copilotNative / copilotCustomAgent / copilotAgentSession (§4, §7) | **missing** | No such files or ids anywhere |
| RoleRegistry / VirtualTeamRegistry (§5) | implemented-and-working | All 21 spec roles present (`RoleRegistry.ts` ROLE_IDS); default team matches spec table (`VirtualTeamRegistry.ts`); multi-role/custom-role/restore tested. **EffortLevel does not exist anywhere** |
| WorkflowRegistry / Runner (§10) | implemented-and-working, 13/15 workflows | `WorkflowRegistry.ts` WORKFLOW_IDS — missing "Copilot Custom Agent Sync" and "Mode Setup / Provider Check"; `WorkflowRunner.ts` validates roles (tested), cannot validate mode (no modes) |
| PromptBuilder (§11) | implemented-and-working, partial vs spec | `PromptBuilder.ts` — identity/roles/workflow/safety/tier/transcript/budget + hard clamp, tested; missing: operating mode, effort level, provider/mode warnings |
| Conductor | stubbed | `Conductor.ts` is 20 lines (`recommendationText`, `summarize`); coordination actually lives in `AgentRoomController`/`WorkflowRunner` |
| ModelAdvisor (§6) | implemented-and-working, partial vs spec | `ModelAdvisor.ts` + 5 passing tests; `TaskCategory` has 14 of 17 values (missing `copilotCustomAgentGeneration`, `copilotIntegrationCheck`, `operatingModeSelection`); recommendation lacks mode + effort |
| CopilotIntegration (§7) | **missing** | No `CopilotIntegration.ts` / `CopilotCustomAgentGenerator.ts` |
| Webview UI + validation (§12) | implemented-and-working, partial vs spec | `html.ts` strict CSP + nonce, local assets only; `AgentRoomPanel.ts` rejects invalid messages; `validation.ts` covers 21 message types with tests; missing the 5 mode/copilot types (`switchOperatingMode`, `checkCopilotCapabilities`, `generateCopilotCustomAgents`, `previewCopilotCustomAgents`, `openCopilotCustomAgentsFolder`); no mode badge in header |
| childProcess utils (§13) | implemented-and-working | `childProcess.ts` — args arrays, `shell:false`, timeout, AbortSignal, redaction, normalization, tree-kill; tested. Has a **deliberate Windows `cmd.exe /d /s /c` fallback** for `.cmd` shims with a strict arg allowlist (deviation to document, not a bug) |
| TranscriptStore (§14) | implemented-and-working, partial vs spec | `TranscriptStore.ts` — memory/workspace/global, markdown+JSON export, tested; per-message metadata lacks operating mode / effort / model name |
| RoomProfileStore (§3.5) | implemented-and-working, partial vs spec | `RoomProfileStore.ts` — single `room-profile.json` with import validation; **not** per-mode `work-profile.json`/`personal-profile.json` |
| SafetyPolicy (§17) | implemented-and-working, partial vs spec | `SafetyPolicy.ts` — dangerous triple-gate, flag blocklist, per-mode instructions, tested; `checkArgs` defined but **never invoked by providers**; no cross-partition blocking (no modes) |
| Settings (§15) | implemented subset | `package.json` — ~40 keys; missing all mode/firstLaunch/copilotIntegration/models.work keys; model keys named `agentRoom.models.claude.*` instead of spec's `agentRoom.models.personal.claude.*`; several useful extra keys (context chips, webResearch domains) |
| Commands (§16) | implemented-and-working, set differs | `commandIds.ts`/`registerCommands.ts`/`package.json` all agree (19 cmds, tested); missing `switchOperatingMode`, `checkCopilotCapabilities`, `generateCopilotCustomAgents`, `previewCopilotCustomAgents`, `openCopilotCustomAgentsFolder`; extra: 5 `sendCurrentSelectionTo<Agent>` cmds |

## 3. API check (engines.vscode vs node_modules/@types/vscode)

- `package.json` `engines.vscode`: `^1.85.0`. Installed `@types/vscode`: **1.120.0**
  (npm resolved `^1.85.0` to the newest 1.x — the project type-checks against APIs far
  newer than its declared engine floor; this mismatch itself needs fixing).
- **Chat Participant API — in installed typings** (`index.d.ts:20118–20126`):
  ```ts
  export namespace chat {
    export function createChatParticipant(id: string, handler: ChatRequestHandler): ChatParticipant;
  }
  ```
  Finalized in VS Code ~1.90 → **not available at runtime on a 1.85 engine floor**.
  Usable only if we bump `engines.vscode` (recommended in Phase 5).
- **vscode.lm / Language Model API — in installed typings** (`index.d.ts:20771`):
  ```ts
  export function selectChatModels(selector?: LanguageModelChatSelector): Thenable<LanguageModelChat[]>;
  ```
  plus `LanguageModelChat.sendRequest(...)` (`index.d.ts:20304`). Same engine caveat
  (finalized ~1.90+). This is the only public path to "company-exposed Copilot models".
- **Agent-session control — does not exist.** Grep over the full 1.120 typings for
  `ChatSession|AgentSession|copilot` finds only the string `copilot` as an example
  vendor id (`index.d.ts:20257`, `:20848`). All `canInvoke*AgentSession` /
  `canReadAgentSessionTranscript` / `canManageCopilotCliSessions` flags must be `false`.

## 4. Conflicts: repo vs spec, with recommendations

1. No operating modes at all — **follow spec** (it's the core product feature).
2. `ProviderRegistry` has no `supportedModes` partition — **follow spec, blend
   mechanically**: keep the existing Map class, add mode-filtered construction in
   `AgentRoomController.createProviderRegistry()` (the single construction site, line 473).
3. `Provider`/`ProviderInvocation`/`ProviderResult` lack `supportedModes`/`operatingMode` — **follow spec** (additive fields).
4. `EffortLevel` missing everywhere (spec §6) — **follow spec** (additive).
5. Extra per-agent selection commands (Atlas/Forge/…) — **keep repo** (useful, harmless); add the spec's missing commands; record in SPEC_DEVIATIONS.
6. Model settings named `agentRoom.models.claude.*` vs spec `agentRoom.models.personal.claude.*` — **follow spec** (extension is unpublished v0.0.1, rename is free and the `personal.`/`work.` namespace is what makes the partition legible).
7. Extra settings (context-chip defaults, webResearch domain prefs, `modelAdvisor.showReasoning`) — **keep repo**; document as deviations.
8. Single `room-profile.json` vs per-mode profiles — **blend**: keep format/validation, split into `work-profile.json` + `personal-profile.json` with cross-mode-provider validation errors.
9. 13/15 built-in workflows — **follow spec**: add "Copilot Custom Agent Sync" and "Mode Setup / Provider Check".
10. Webview validator missing 5 mode/copilot message types — **follow spec** (additive).
11. Windows `cmd.exe` fallback in `childProcess.ts` vs spec "never shell" — **keep repo**: required for npm `.cmd` shims (CVE-2024-27980 hardening), allowlisted and quoted; document prominently in SPEC_DEVIATIONS.
12. Capability detection computed in healthCheck but ignored by `runTurn` (no §8 fallback ladders) — **follow spec** (Phase 6).
13. `SafetyPolicy.checkArgs` never called — **blend**: wire it into both CLI providers' arg construction.
14. `Conductor` is skeletal — **keep repo**: controller/runner already do the coordination; expand Conductor only where workflows need it.
15. `TaskCategory` missing 3 spec values — **follow spec**.
16. engines 1.85 vs typings 1.120 — **follow spec, front-loaded to Phase 1**: today's compile success proves nothing about runtime API availability while the floor and the typings disagree. Bump `engines.vscode` and pin `@types/vscode` to the matching version in Phase 1 so every subsequent phase compiles against the truth. Verify the actual finalization versions of `chat.createChatParticipant` and `vscode.lm` against the VS Code release notes (do not trust "~1.90" from memory) and pick the floor that genuinely covers both. Cost (users below that VS Code version can't install) is irrelevant for unpublished v0.0.1.
17. PromptBuilder missing mode/effort/warnings; transcript messages missing mode/model/effort — **follow spec** (additive, Phases 8–9).
18. `CLAUDE.md` does not contain the PROMPTS.md Standing Rules block (it currently holds the bootstrap instruction telling us to copy them in) and `docs/SPEC_DEVIATIONS.md` does not exist — **follow spec/PROMPTS.md**: do both in Phase 1.

## 5. Phase Plan (each phase ends with the §20 gate green + reviewable diff)

Baseline is already green, so spec-Phase-1 shrinks to housekeeping; childProcess,
webview validation, and transcripts are largely done, so their phases shrink to gap-closing.

### Phase 1 — Housekeeping & standing rules (small)
- **First action, before anything else in any session:** append the PROMPTS.md "Standing Rules" block to `CLAUDE.md` (replacing the bootstrap instruction) and verify it is there. Session 0 ran without the rules in place (no harm — it wrote no code), but no further work happens until this copy is verified.
- **Engine/typings truth-up:** verify the actual finalization versions of `chat.createChatParticipant` and `vscode.lm.selectChatModels` against the VS Code release notes; bump `engines.vscode` to the floor that genuinely covers both and pin `@types/vscode` to the matching version, so every subsequent phase compiles against the real API surface. Confirm the gate stays green after the pin.
- Create `docs/SPEC_DEVIATIONS.md` seeded with the deviations above (cmd.exe fallback, extra commands/settings, Conductor scope, engine bump rationale).
- Gate: green after the typings change (compile/test/lint re-run, real output reported).

### Phase 2 — Operating modes (§3.1, §3.5, §3.6, §15, §16)
- Add `OperatingMode` type; `agentRoom.operatingMode` setting + per-workspace persistence (`workspaceState`).
- First-launch picker (§3.6) behind `agentRoom.firstLaunch.showModePicker`.
- `agentRoom.switchOperatingMode` command with §3.4 guarded flow: typed confirmation Work→Personal, close provider sessions, start new mode-tagged transcript segment.
- Per-mode profiles in `RoomProfileStore` (`work-profile.json`/`personal-profile.json`), cross-mode-provider validation error, no secrets.
- Webview: header mode badge + canonical mode strings; `switchOperatingMode` message type in `validation.ts`.
- Mode-related §15 settings keys. Tests: §18 OperatingMode block.

### Phase 3 — Registry-level partition + SafetyPolicy enforcement (§3.4, §4, §17, §18)
- `supportedModes` on `Provider`/`ProviderProfile`; `AgentRoomController.createProviderRegistry()` constructs **only** in-mode providers (cross-mode providers absent as objects, both directions).
- `operatingMode` added to `ProviderInvocation`/`ProviderResult` and stamped on messages.
- SafetyPolicy: block cross-partition fallback; wire `checkArgs` into both CLI providers.
- WorkflowRunner: mode validation + helpful system messages incl. the §6 separation guard; ModelAdvisor emits the guard instead of cross-mode suggestions.
- Tests: registry absence (not disabled), profile cross-mode validation, SafetyPolicy, WorkflowRunner mode validation — both directions.

### Phase 4 — Copilot custom agent generation (§7 Level 1, §15, §16)
- `src/core/CopilotCustomAgentGenerator.ts`: five `.github/agents/*.agent.md` files with all §7 sections; respects `customAgentsDirectory`; preview/write/update/skip-modified; never overwrite user-edited files without confirmation.
- Commands: `generateCopilotCustomAgents`, `previewCopilotCustomAgents`, `openCopilotCustomAgentsFolder` (+ webview messages); `copilotIntegration.*` settings.
- Add "Copilot Custom Agent Sync" workflow. Tests: generation + no-overwrite.

### Phase 5 — Copilot capability detection + copilotNative provider (§7 L2/L3, §0.4, §3.2)
The fattest phase with the most judgment calls — **a split into 5a/5b is pre-authorized**;
5a alone is an acceptable clean checkpoint (gate green, diff reviewable).

**Phase 5a (do first):**
- `src/core/CopilotIntegration.ts` implementing `CopilotIntegrationCapabilities` exactly; extension detection via `vscode.extensions.getExtension("GitHub.copilot"/"GitHub.copilot-chat")`; every agent-session flag hard `false` (verified absent from typings — quote declarations in comments); `limitations[]` uses the canonical §3.2 strings. Engine/typings floor already settled in Phase 1.
- `copilotNative` provider backed by `vscode.lm.selectChatModels` (Work Mode), honest "no models exposed" health when empty.
- `checkCopilotCapabilities` command + webview panel + message type. Tests: capability detection.

**Phase 5b (acceptable follow-up session):**
- `@agent-room` chat participant behind `registerChatParticipant` (default false), §7 Level 2 behaviors only.
- `copilotCustomAgent` provider representing generated files; `copilotAgentSession` disabled scaffold.
- Add "Mode Setup / Provider Check" workflow.

### Phase 6 — Local CLI provider hardening (§8, §13)
- Make `runTurn` consult detected capabilities: Claude — degrade stream-json → json → plain; Codex — drop `--json`, `--cd`→`cwd`, plain-text parse; never dangerous flags (checkArgs already wired in Phase 3).
- Canonical §12 friendly missing/auth strings in health results. Cache health-check capabilities for runTurn use.
- Tests: degradation ladders, cancellation, redaction (extend existing childProcess tests; runner itself already meets §13).

### Phase 7 — Webview UI polish + message validation (§2, §12)
- §12 layout completion: command bar (advisor/context/diagnostics/copilot toggles), typing indicators ("Atlas is planning…"), provider/role/mode badges on every message, collapsible Operating Mode + Copilot panels.
- Validator already strict; confirm the full §12 allowed list (the 5 new types landed in Phases 2/4/5) and add malformed-payload tests for them.
- Dark/light theme verification, keyboard/ARIA pass. No remote resources (already true).

### Phase 8 — Model Advisor + workflows completion (§6, §10, §11)
- `EffortLevel` type plumbed through team config, invocation, PromptBuilder (advisory text where no real control exists); `confirmBeforeDeepReasoning` flow.
- Add missing `TaskCategory` values + mode-aware recommendations matching §6 example shapes (incl. operating mode, effort, confirmation requirements); apply/ignore flow already has message types.
- `agentRoom.models.work.*` / rename personal model keys; PromptBuilder emits mode, provider identity, warnings; verify maxPromptChars tests still pass.

### Phase 9 — Transcript storage & export completion (§14)
- Per-message operating mode / model tier or name / effort recorded; `.agent-room/README.md` + `.gitignore` scaffolding; export includes the new metadata; mode-switch segmentation (built in Phase 2) covered by tests.

### Phase 10 — Documentation reconciliation (§19)
- Rewrite `README.md` against reality; write `docs/OPERATING_MODES.md`, `COPILOT_INTEGRATION.md`, `WORK_MODE.md`, `PERSONAL_MODE.md`, `MODE_SEPARATION.md`; `prompts/013` + `014`; update `CHANGELOG.md`; final SPEC_DEVIATIONS sweep; full §20 gate + manual checklist (state honestly what can't be launched here).

## Verification (every phase)

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
npm install && npm run compile && npm test && npm run lint
```

All four verified green on the current tree in this session (35/35 tests). Manual
Extension-Development-Host checks per §20 where applicable to the phase.
