# Agent Room — Session Prompts

How to use this file:

1. Commit `SPEC.md` to the repo as `docs/SPEC.md`.
2. Append the **Standing Rules** block below to the repo's `CLAUDE.md` (create it if
   missing) so every session inherits the constraints without re-pasting them.
3. Run **Session 0** first in plan mode. Review and approve its plan before any code.
4. Run one phase per session. Do not combine phases. Review the diff between sessions.
5. If a session's verification gate fails, the next session starts with "fix the gate"
   before new work.

---

## Standing Rules → append to CLAUDE.md

```markdown
# Agent Room — Standing Rules (apply to every session)

The authoritative spec is docs/SPEC.md. Read the sections relevant to the current task
before changing related code. Section 0 (Authority & Conflict Resolution) overrides
everything: the repo is reality, the spec is intent; prefer existing architecture unless
demonstrably broken; log every deviation in docs/SPEC_DEVIATIONS.md.

Hard constraints, never violated in any phase:
- No private VS Code APIs. Verify API availability against node_modules/@types/vscode
  and engines.vscode — not from memory.
- No Copilot Chat scraping, no Copilot UI automation, no terminal screen-scraping.
- No visible terminals for normal Claude/Codex runs; spawn with args arrays, never
  shell: true, never shell-concatenated strings.
- Hard mode partition (SPEC §3.4): personal providers (claudeCodeCli, codexCli,
  openAiWebSearch) must be UNREGISTERED — not merely disabled — in Work Mode, and
  Copilot providers unregistered in Personal Mode. There is no mixed/hybrid mode and
  none may be added. No org-policy bypass.
- No secrets/API keys/environment variables in logs, transcripts, profiles, or webview
  state. Redact in diagnostics.
- No dangerous/yolo/bypass flags by default. Human stays Final Approver.
- No remote fonts/CDNs/scripts in the webview. Strict CSP + nonce. No unsafe innerHTML.
- Never delete failing tests to pass. Never claim success if compile/test/lint fail.
  Never claim a file changed unless it actually changed.
- Honest false beats fake true for every Copilot capability flag.

Verification gate — run at the end of every session and report actual output:
  node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
  npm install && npm run compile && npm test && npm run lint

End-of-session report format (no other sections):
  ## Files Changed — exact paths, grouped by purpose
  ## Verification — commands run + real results (pass/fail, counts)
  ## Deviations — anything added to docs/SPEC_DEVIATIONS.md this session
  ## Known Limitations — honest
  ## Next — what the following session should start with
```

---

## Session 0 — Audit & Phase Plan (run in plan mode; no code changes)

```
Read docs/SPEC.md in full, then audit this repository against it.

1. Baseline: run npm install, npm run compile, npm test, npm run lint. Report real
   results, including every failure verbatim (truncate long output sensibly).
2. Inventory: for each subsystem the spec names (operating modes, ProviderRegistry,
   providers, RoleRegistry/VirtualTeamRegistry, WorkflowRegistry/Runner, PromptBuilder,
   Conductor, ModelAdvisor, CopilotIntegration, webview UI + message validation,
   childProcess utils, TranscriptStore, RoomProfileStore, SafetyPolicy, settings,
   commands), classify it as: implemented-and-working / implemented-but-broken /
   stubbed / missing. Cite the actual files you read.
3. API check: inspect engines.vscode and node_modules/@types/vscode. State which of
   these are available at our engine version: Chat Participant API, vscode.lm
   (selectChatModels / Language Model API), anything resembling agent-session control.
   Quote the relevant type declarations.
4. Conflicts: list every place the repo's architecture diverges from the spec and
   recommend per item: keep repo / follow spec / blend both, with one-line reasons.
5. Produce a phase plan mapped to spec sections, ordered roughly: (1) green baseline,
   (2) operating mode setting + first-launch picker + per-mode profiles + guarded mode
   switching, (3) registry-level provider partition + SafetyPolicy enforcement + tests, (4) Copilot custom agent generation,
   (5) Copilot capability detection + chat participant if API-supported, (6) local CLI
   provider hardening (capability detection, JSON parsing, cancellation, redaction),
   (7) webview UI polish + message validation, (8) Model Advisor + workflows
   completion, (9) transcript storage/export, (10) docs reconciliation. Merge or
   reorder phases if the audit shows some work is already done — each phase must end
   with the verification gate green and a reviewable diff.

Do not write or modify any code in this session. Output the audit and the plan only.
```

---

## Phase Session Template

Use this for every implementation session, filling in the phase:

```
Phase <N> of the Agent Room plan: <phase name>.

Before coding, re-read these docs/SPEC.md sections: <relevant section numbers>.
Also re-read docs/SPEC_DEVIATIONS.md.

Scope for this session — implement exactly this, nothing beyond it:
<paste the phase's scope from the approved Session 0 plan>

Done means:
- The scope items work, with tests added/updated per SPEC.md §18 for the touched
  subsystems.
- The verification gate passes (compile, test, lint) — run it and show real output.
- No regressions: previously passing tests still pass.
- SPEC_DEVIATIONS.md updated if you diverged from the spec.

If you discover the scope is too large to finish with the gate green, stop at a clean
checkpoint: finish a coherent subset, leave the build green, and state exactly what
remains in the Next section. Do not leave the repo in a broken intermediate state.
```

---

## Pre-written Phase Prompts

These assume the default phase ordering; adjust to whatever Session 0's approved plan
says. Each is the template above with scope filled in.

### Phase 1 — Green Baseline

```
Phase 1: Green baseline. Re-read docs/SPEC.md §0 and §20.

Scope: make npm run compile, npm test, and npm run lint all pass on the current
codebase with no feature work. Fix broken code, broken configs, type errors, and
legitimately wrong tests (justify any test you change in SPEC_DEVIATIONS.md). Verify
package.json contributes (settings/commands) parses and registerCommands.ts matches
package.json — fix mismatches but do not add new commands yet.

Done means: gate green; no features added; SPEC_DEVIATIONS.md notes any test changes.
```

### Phase 2 — Operating Modes

```
Phase 2: Operating modes. Re-read docs/SPEC.md §3, §15 (mode-related keys), §16
(agentRoom.open, agentRoom.switchOperatingMode).

Scope: implement agentRoom.operatingMode (two values only) with per-workspace
persistence; the first-launch mode picker (§3.6) honoring
agentRoom.firstLaunch.showModePicker; the Switch Operating Mode command with the §3.4
guarded-switch flow (typed confirmation Work → Personal, new mode-tagged transcript
segment, provider sessions closed); per-mode profile files (work-profile.json,
personal-profile.json) via RoomProfileStore with cross-mode-provider validation errors
(no secrets); header mode badge + canonical mode strings in the webview; the
mode-related settings from §15. Add the OperatingMode tests from §18.

Done means: gate green; mode picker appears once per workspace; guarded switching
works as specified; tests cover default/switch-confirmation/persistence/segmenting.
```

### Phase 3 — Provider Mode-Gating & Safety Enforcement

```
Phase 3: Provider gating. Re-read docs/SPEC.md §4, §3.2–3.4, §17, §18
(ProviderRegistry, SafetyPolicy, WorkflowRunner mode tests).

Scope: ProviderRegistry implements the §3.4 hard partition — providers whose
supportedModes excludes the current mode are NOT REGISTERED (absent from the registry,
not disabled flags): personal providers don't exist as objects in Work Mode, Copilot
providers don't exist in Personal Mode. SafetyPolicy blocks any cross-partition
fallback and blocks dangerous modes by default. WorkflowRunner validates mode + roles
before running (§10 rules) and emits the helpful system messages — including the §6
separation guard — instead of silently substituting. Add the §18 tests for
ProviderRegistry (unregistered cross-mode providers, profile validation errors),
SafetyPolicy, and WorkflowRunner mode validation.

Done means: gate green; a Work Mode session cannot construct or invoke a personal
provider by any code path (prove it: the test asserts the provider is absent from the
registry, not merely disabled); tests cover both partition directions.
```

### Phase 4 — Copilot Custom Agent Generation

```
Phase 4: Copilot custom agents (Level 1). Re-read docs/SPEC.md §7 (Level 1), §16
(the four copilot commands), §15 (copilotIntegration.* keys).

Scope: CopilotCustomAgentGenerator producing the five .github/agents/*.agent.md files
with all required sections (§7), respecting customAgentsDirectory; preview / write /
update / skip-modified flows with no overwrite of user-edited files without
confirmation; the four commands (generate, preview, open folder, checkCapabilities
stub wired but capability logic may land in Phase 5). Add §18 CopilotIntegration
generation + no-overwrite tests.

Done means: gate green; generation round-trips safely; modified-file protection tested.
```

### Phase 5 — Copilot Capability Detection & Chat Participant

```
Phase 5: Copilot capability detection (Levels 2–3 gating). Re-read docs/SPEC.md §7
(capability interface, Level 2, Level 3), §0.4, §3.2 detection list.

Scope: CopilotIntegration.ts implementing CopilotIntegrationCapabilities exactly as
specified — extension/chat detection via vscode.extensions.getExtension; every
direct-session flag false unless you verified the public API in
node_modules/@types/vscode (quote the declaration in code comments where a flag could
be true); limitations[] populated with the canonical §3.2 strings. Surface the
capability report in the webview Copilot panel and via the checkCopilotCapabilities
command. Implement the @agent-room chat participant ONLY if the Chat Participant API
exists in our engine's typings, behind
agentRoom.copilotIntegration.registerChatParticipant (default false), with only the
§7 Level 2 allowed behaviors; otherwise document why in SPEC_DEVIATIONS.md.
copilotAgentSession remains a disabled, capability-gated scaffold — no fake
implementation. Add §18 capability-detection tests.

Done means: gate green; capability flags provably match the installed typings; honest
limitation strings render; no scraping/private-API code paths exist.
```

### Phase 6 — Local CLI Provider Hardening

```
Phase 6: Local CLI providers. Re-read docs/SPEC.md §8, §13, §18 (ChildProcess tests).

Scope: ClaudeCodeProvider capability detection (--help parsing for -p/--print,
--output-format stream-json/json) with graceful degradation through the §8 command
patterns; CodexCliProvider preferred invocation with the §8 fallback ladder (drop
--json, drop --cd → cwd, plain-text parsing); shared child-process runner meeting all
§13 requirements (args arrays, no shell, separate stdout/stderr, stdin, timeout,
AbortSignal cancellation wired to the Stop button, line-ending normalization, secret
redaction, diagnostic truncation, no env logging); health checks with the friendly §12
missing/auth messages. Add §18 ChildProcess tests.

Done means: gate green; both providers degrade gracefully when flags are unsupported;
cancellation and redaction are tested.
```

### Phase 7 — Webview UI Polish & Message Validation

```
Phase 7: Webview. Re-read docs/SPEC.md §2, §12, §18 (webview validation tests).

Scope: bring the webview to the §12 layout (header, command bar, transcript, composer,
collapsible panels) and §2/§12 style bar — VS Code CSS variables only, compact and
professional, verified against dark and light themes; typing indicators; provider/
role/mode badges on every message; strict CSP + nonce, local assets only, DOM-API text
insertion (no unsafe innerHTML); a webview message validator accepting exactly the §12
allowed message list and rejecting unknown/malformed messages. Add §18 webview
validation tests. Keyboard navigation and ARIA on interactive controls.

Done means: gate green; message validation tested; screenshots or honest description
of dark/light rendering; no remote resources anywhere in the webview.
```

### Phase 8 — Model Advisor & Workflows

```
Phase 8: Model Advisor + workflows. Re-read docs/SPEC.md §6, §10, §11, §18
(ModelAdvisor, PromptBuilder, WorkflowRunner tests).

Scope: ModelTier/EffortLevel plumbed through team config, ProviderInvocation, and
PromptBuilder; effort mapped to real provider controls where they exist, advisory
prompt text otherwise; confirmBeforeDeepReasoning honored; Model Advisor implementing
the §6 task categories and recommendation shape, advisory by default, with the apply/
ignore webview flow; all §10 built-in workflows present in WorkflowRegistry with role+
mode validation; PromptBuilder emitting every §11 element and enforcing maxPromptChars.
Add the §18 ModelAdvisor and PromptBuilder tests.

Done means: gate green; advisor recommendations match the §6 examples' shape; prompts
verifiably contain mode/provider/roles/effort/workflow/warnings and exclude full repo.
```

### Phase 9 — Transcripts & Export

```
Phase 9: Transcripts. Re-read docs/SPEC.md §14, §18 (TranscriptStore tests).

Scope: TranscriptStore supporting memory/workspace/global per
agentRoom.transcriptStorage; the .agent-room/ workspace layout incl. README.md and
.gitignore; every message recording the full §14 metadata; Markdown export reading as
a professional conversation and JSON export; export/clear commands and webview
actions wired. Add §18 TranscriptStore tests.

Done means: gate green; round-trip persistence tested; exports contain mode/provider/
model/effort/roles per message.
```

### Phase 10 — Documentation Reconciliation

```
Phase 10: Docs. Re-read docs/SPEC.md §19 and the entire SPEC_DEVIATIONS.md.

Scope: rewrite README.md to match what the extension ACTUALLY does now, covering every
§19 README item — where something is deferred or unsupported, say so plainly using the
canonical limitation strings. Write docs/OPERATING_MODES.md, COPILOT_INTEGRATION.md,
WORK_MODE.md, PERSONAL_MODE.md, MODE_SEPARATION.md (why there is no mixed mode and how
the partition is enforced), and prompts/013 + 014. Cross-check
every claim against the code; do not document features that don't exist. Update
CHANGELOG.md. Run the full §20 verification gate and the manual checklist (or state
honestly which manual items can't be verified in this environment).

Done means: gate green; README matches reality; §21 success criteria each marked
met / honestly-deferred with evidence.
```
