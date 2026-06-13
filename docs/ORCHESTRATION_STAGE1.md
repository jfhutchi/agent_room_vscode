# Orchestration — Stage 1: Debate → Consensus (design)

Status: draft for review (2026-06-13). First slice of the autonomous multi-agent
vision; see the staging note at the bottom for Stages 2–3.

## Goal

A hands-off planning debate. The user states a goal; the Conductor runs intake; two
cross-provider agents debate a plan until they agree — all streamed into the chat as a
human-readable conversation, with no per-turn clicking.

## Scope

**In:** Personal Mode only (Claude + Codex CLIs). Intake questions, the
propose→critique→revise loop, deterministic consensus detection, a hard round cap, the
Stop interrupt, and an approval gate when the stage completes.

**Out (later):** adversarial review (Stage 2); task breakdown + parallel execution +
scrum/review (Stage 3). **Work Mode orchestration is deferred** — the user will design a
work-appropriate orchestrator later; the Copilot/Work code stays dormant, not deleted.

## Control model (per user constraints)

- **One action to start** (enter the goal). The Conductor then posts a single batch of
  clarifying questions; the user answers once. After that the loop is autonomous — **no
  per-turn clicking.**
- **Full chat history** — every turn (proposal, critique, revision, narration) streams
  into the transcript and stays, scrollable.
- **Approval gate when the stage is done** — on consensus, the Conductor pauses and the
  user approves the agreed plan before Stage 2. A PushNotification fires at the gate
  (reaches the phone if Remote Control / the Claude app is connected).
- **Stop** always interrupts mid-loop. The human remains Final Approver (SPEC §17).

## Flow

1. **Start.** User opens "Orchestrated Build" (new run mode) and enters the goal.
2. **Intake.** The Conductor (provider-backed) posts up to *N* questions (default 3) in
   one message. The user answers in the composer.
3. **Propose.** The Conductor briefs the proposer (the agent holding Planner/Architect —
   Atlas, on `claudeCodeCli`). Atlas posts a plan.
4. **Critique.** The critic (the Reviewer holder — Sentinel, on `codexCli`) posts
   concrete issues and a verdict.
5. **Loop.** If the verdict is `revise`, Atlas revises addressing the points; Sentinel
   re-reviews. Repeat — automatically.
6. **Consensus.** When Sentinel returns `agree` on Atlas's latest plan, the Conductor
   posts "Consensus reached" + a one-paragraph plan summary, then opens the approval gate.
7. **Cap.** If `maxDebateRounds` is hit without agreement, the Conductor stops, summarizes
   the open disagreement, and hands the decision to the user.

## Consensus protocol (the crux)

Each debating turn ends with a machine-readable trailer the orchestrator parses **in
code** and **strips from the displayed message**, so the chat stays human-readable:

```
«agent-room verdict=propose|revise|agree; summary=<one line>»
```

- Proposer emits `propose` (first turn) then `revise` thereafter.
- Critic emits `agree` or `revise`.
- Consensus = the critic's latest verdict is `agree`.
- A missing/garbled trailer is treated conservatively as `revise`, and the Conductor
  notes it. No "judge" LLM is needed — termination is deterministic.

## Components & code changes (grounded in the existing architecture)

- **`src/core/Orchestrator.ts`** (new, `vscode`-free, headlessly testable): drives the
  loop — builds invocations, calls `ProviderRegistry.runTurn`, appends each result to the
  transcript, parses verdicts, enforces the cap, and decides termination. Pure logic; the
  controller injects the registry, team, an append callback, and an `AbortSignal`.
- **Conductor** gains a backing provider for intake-question generation and narration
  (today `internalConductor` has none). Add an `orchestratorProvider`, defaulting to the
  mode's lead reasoning provider (`claudeCodeCli` in Personal Mode), configurable.
- **Roles, not hardcoded names.** Proposer = holder of Planner/Architect; critic = holder
  of Reviewer — resolved through the existing role system, with the cross-provider default
  (proposer on Claude, critic on Codex) coming from the default team.
- **`AgentRoomController`**: a `startOrchestratedBuild` path that runs the loop,
  auto-advancing without waiting on the webview, streaming each turn; a new command +
  webview message; fires `PushNotification` at the approval gate.
- **Webview**: a round indicator ("Debate — round 2/6"), a prominent Stop, and trailer
  stripping. The redesigned chat already renders the turns.
- **Settings**: `agentRoom.orchestration.maxDebateRounds` (default 6),
  `agentRoom.orchestration.maxIntakeQuestions` (default 3),
  `agentRoom.orchestration.orchestratorProvider` (default `claudeCodeCli`).

## Guardrails / safety

Hard round cap; Stop; the approval gate; Personal-mode partition enforced (the loop only
ever touches in-mode providers — no cross-partition substitution, SPEC §3.4); no
dangerous flags; honest cost expectations. Conductor narration never fabricates agent
statements not in the transcript (SPEC §11).

## Testing (§18 style, headless)

- Verdict parsing: `propose` / `revise` / `agree`, and missing-trailer → `revise`.
- Consensus termination: an `agree` ends the loop with the summary.
- Cap enforcement: no infinite loop; stops at *N* and produces a disagreement summary.
- Mode partition: the debate resolves to in-mode providers and refuses cross-mode.
- Intake: a single batched question turn, capped at `maxIntakeQuestions`.

## Staging (for context)

- **Stage 1 (this doc):** debate → consensus.
- **Stage 2:** an adversarial reviewer attacks the agreed plan; loop back on real issues.
- **Stage 3:** task breakdown → parallel execution → scrum-style reporting → review to
  finalize. The heavy lift (the current runner is single-agent/sequential).
