# SPEC_DEVIATIONS

Log of every place this repo deliberately diverges from `docs/SPEC.md` (either
direction), per SPEC §0. One entry per deviation, with the reason and the session
that recorded it.

---

## 1. `engines.vscode` bumped 1.85 → 1.91; `@types/vscode` pinned exactly (Phase 1)

**What:** `package.json` `engines.vscode` changed from `^1.85.0` to `^1.91.0`, and
`@types/vscode` changed from `^1.85.0` (which npm was resolving to 1.120.0 — typings
far newer than the declared engine floor) to the exact pin `1.91.0`.

**Why:** The spec (§0.4) requires API availability claims to be verified against the
installed typings *and* the engine floor; with a 1.85 floor and 1.120 typings, the
project type-checked against APIs that would not exist at runtime. The Copilot work in
Phases 5a/5b needs `chat.createChatParticipant` and `vscode.lm.selectChatModels`.
Evidence from the VS Code release notes (verified 2026-06-12, not from memory):

- [v1.90 release notes](https://code.visualstudio.com/updates/v1_90) (May 2024):
  "We have finalized APIs that enable extensions to participate in chat and to access
  language models." followed by "**Important**: These APIs are finalized but are
  currently only available in VS Code Insiders."
- [v1.91 release notes](https://code.visualstudio.com/updates/v1_91) (June 2024):
  "In this release, these APIs are now fully available in VS Code Stable."

So 1.90 is the finalization release but Insiders-only; **1.91 is the first stable
release where both APIs are fully available**, hence the floor. The `@types/vscode`
pin is exact (`1.91.0`, no caret) so the compile-time API surface cannot silently
drift above the engine floor again. Cost — users on VS Code < 1.91 cannot install — is
irrelevant for an unpublished v0.0.1.

## 2. Windows `cmd.exe /d /s /c` fallback in `src/utils/childProcess.ts` (pre-existing; recorded Phase 1)

**What:** SPEC §13 says spawn with args arrays and never a shell. The shared runner
honors that everywhere except one deliberate carve-out: on Windows, `.cmd`/`.bat`
shims (how npm installs CLI entry points such as the Claude/Codex CLIs) cannot be
spawned with `shell: false` since Node's CVE-2024-27980 hardening. The runner falls
back to `cmd.exe /d /s /c` for those shims only, with a strict argument allowlist and
quoting; no user-controlled string is ever concatenated into a shell line.

**Why:** Without it the extension simply cannot run npm-installed CLIs on Windows.
This is a narrowing of the spec's "never shell" to "never shell except the audited
Windows shim path", which preserves the rule's intent (no injection surface).

## 3. Extra commands beyond SPEC §16 (pre-existing; recorded Phase 1)

**What:** Five `agentRoom.sendCurrentSelectionTo<Agent>` commands (Atlas, Forge,
Sentinel, Gauge, Scout) plus assigned-role variants exist in `package.json`,
`commandIds.ts`, and `registerCommands.ts` but are not in the spec's command list.

**Why:** Useful, harmless, tested, and consistent across all three declaration sites.
SPEC §0.1 prefers existing working architecture; the spec's own missing commands will
be added in their phases (2, 4, 5) rather than deleting these.

## 4. Extra settings beyond SPEC §15 (pre-existing; recorded Phase 1)

**What:** `package.json` contributes several keys the spec does not name: context-chip
defaults, `webResearch` domain preferences, and `modelAdvisor.showReasoning`.

**Why:** Working, user-visible functionality; removing them would regress the existing
Personal-Mode experience. The spec's missing mode/firstLaunch/copilotIntegration/work
model keys land in their respective phases. (The `agentRoom.models.claude.*` →
`agentRoom.models.personal.claude.*` rename is planned for Phase 8 and will be logged
when it happens.)

## 5. `Conductor` is intentionally skeletal (pre-existing; recorded Phase 1)

**What:** The spec names Conductor as a coordination subsystem; in this repo
`src/core/Conductor.ts` is ~20 lines and real coordination lives in
`AgentRoomController` + `WorkflowRunner`.

**Why:** SPEC §0.1/§0.2 — the repo's architecture works and is tested; we keep the
controller/runner split and expand Conductor only where future workflows genuinely
need it, instead of rewriting working code to match the spec's naming.

## 6. Invalid configured operating mode forces explicit selection (Phase 2)

**What:** SPEC §3.1 gives `agentRoom.operatingMode` a default of `personalLocal`. If
the setting holds a value outside the two-value enum (only possible by hand-editing
settings JSON, e.g. `"hybrid"`), Agent Room does not silently coerce it to the
default; it surfaces an error and requires the user to pick Work or Personal Mode
before the room opens.

**Why:** Silently mapping an unknown value to `personalLocal` could route a company
repository to personal providers because of a typo. Failing closed preserves §3.4's
partition intent; "hybrid" must never resolve to a real mode.

## 7. `workMode.enabled` / `personalMode.enabled` semantics (Phase 2)

**What:** SPEC §15 lists `agentRoom.workMode.enabled` and
`agentRoom.personalMode.enabled` but no section defines their behavior. Phase 2
implements them as: a disabled mode is hidden from the first-launch picker and the
Switch Operating Mode picker, and explicit switches to it are refused with a message.
If both are disabled, both pickers fall back to offering both modes rather than
locking the user out of the extension.

**Why:** The keys must exist per §15 and dead settings would be dishonest; this is
the minimal reasonable reading. The both-disabled fallback avoids a configuration
that bricks the room.

## 8. Chat participant handler always attached; behaviors gated by the setting (Phase 5b)

**What:** SPEC §15 reads `agentRoom.copilotIntegration.registerChatParticipant`
(default false) as gating participant *registration*. Phase 5b instead attaches the
`@agent-room` handler whenever the public Chat Participant API exists, and gates the
§7 Level 2 *behaviors* at request time: with the setting off, the participant replies
only with a one-line notice explaining how to enable it (no state, no recommendations,
no buttons).

**Why:** A chat participant must be declared in `package.json`
(`contributes.chatParticipants`), which makes `@agent-room` visible in the chat UI
regardless of runtime registration. With the literal reading, every default-settings
user would see `@agent-room` in the picker and get a VS Code "participant not
registered" error when invoking it. Attaching a handler that politely says "disabled"
preserves the setting's intent (no Level 2 behavior unless opted in) without shipping
a broken-looking default experience.
