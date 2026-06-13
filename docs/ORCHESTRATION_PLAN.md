# Agent Room — Orchestration Plan (authoritative direction)

Adopted 2026-06-13 by the product owner, from a claude.ai/design **engineering spec**
(architecture) plus a **chat-interface mockup** (the ultimate look). This supersedes the
phased plan in `docs/SPEC.md` for the product direction; see `SPEC_DEVIATIONS.md` entry 9.

## The two inputs

- **Architecture / how it works → the engineering spec.** A local, human-supervised
  multi-agent workspace that orchestrates `claude-cli` + `codex-cli` to debate, plan, and
  execute, with **an approval gate in front of every real action** and an append-only
  audit log. Agents never perform side effects themselves — they emit an `ActionProposal`;
  the engine executes only after a human `ApprovalDecision`. Permission tiers:
  **SAFE** (auto) · **RISKY** (needs approval: fs.write, deps.add, cmd.run) · **BLOCKED**
  (never: writes outside workspace, secrets, force-push, disabling the gate).
- **Look / how it ultimately appears → the chat mockup.** A three-column room: **agent
  rail** (status, confidence, capabilities, pause/mute/redirect) · **transcript** (turn
  token, tags, debate mode, run-next-turn) · **contextual tabs** (Work / Approvals /
  Debate / Evidence / Memory), with the **Approvals tab** showing risk-badged diff cards
  and Approve / Reject / Modify. A phase stepper across the top.

## Scope decisions (owner)

- **Personal mode only for now.** Work Mode / Copilot is dormant, removed in a cleanup
  pass after Stages 2–3.
- **No ollama / local-model runtime for now** — claude-cli + codex-cli only.
- **VS Code surface:** the three-column look lives in a **wide editor-area webview tab**
  (not the narrow sidebar). Native diff editors for approvals are an optional later
  enhancement; the mockup's in-panel diff cards are the baseline.
- **Remove old code as replacements land** — when the orchestrator/approval gate replaces
  the old fixed-workflow path, or the new UI replaces old chat bits, delete the obsolete
  code in the same step. Keep the build green throughout.

## Engine principles

- The engine (the vscode-free `src/core`) owns the turn scheduler, approval gate,
  permission model, and audit log. Orchestration control flow is **deterministic code**;
  models are used only for agent turns and judgment (not the control loop). Stays
  in-process in the extension host for now; the daemon/socket split is deferred until a
  second front-end (standalone app) needs it.

## Re-staged build sequence

1. **Stage 1 — Debate → consensus.** ✅ Done (`Orchestrator.runDebate`, wired into the
   room as "Start Orchestrated Build": intake → proposer/critic loop → consensus).
2. **Stage 2 — Adversarial gate.** Core ✅ (`runAdversarialReview` + `runOrchestration`:
   debate → attack → loop-back-on-flaw → approve). Wiring into the controller in progress.
3. **Approval-gate spine (next pillar).** `ActionProposal` / `ApprovalDecision` / audit
   events; CLIs run propose/read-only and emit diffs & commands; engine executes only
   after approval. This is the product's core safety guarantee.
4. **UI toward the three-column look.** Evolve the webview into agent rail · transcript ·
   tabs, with the Approvals tab front and centre.
5. **Parallel build (Stage 3).** Task breakdown → parallel WorkItems → scrum-style
   reporting → review-to-finalize, all flowing through the approval gate.
6. **Later.** Remaining debate modes (round_robin, challenge, silent_draft,
   human_arbitration), the standalone app surface, then Work Mode + a work orchestrator.

## Open questions (owner answers, applied)

- **Workspaces:** shared working copy for MVP; isolate later via git worktrees.
- **CLI metering:** per-room budget (max rounds/cycles + wall-clock) enforced by the
  scheduler.
- **Approval granularity:** per action for RISKY ops; batch SAFE/read-only.
- **Moderator:** deterministic orchestration code; a model only for summary/judgment.
