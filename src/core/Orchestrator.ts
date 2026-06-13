/**
 * Stage 1 orchestration core — the autonomous "debate to consensus" loop.
 * See docs/ORCHESTRATION_STAGE1.md.
 *
 * Host-agnostic and headlessly testable: no `vscode` import. The controller
 * injects how a turn is actually run (prompt build + provider call) and how a
 * completed turn is emitted (transcript append + webview hydrate), so the loop
 * logic — ordering, consensus detection, the round cap, cancellation — can be
 * exercised directly with fakes.
 */

export type DebateVerdict = "propose" | "revise" | "agree";
export type DebateRole = "proposer" | "critic" | "adversary";

export interface ParsedTurn {
  /** Message text with the verdict trailer removed — safe to display. */
  display: string;
  verdict?: DebateVerdict;
  summary?: string;
}

/**
 * Matches the machine-readable trailer agents are asked to end with, e.g.
 * `«agent-room verdict=agree; summary=...»`. Tolerant of the wrapping
 * delimiter (« », << >>, [[ ]], or none) since CLI models vary; the summary
 * runs to a closing delimiter or end of line.
 */
const VERDICT_RE =
  /(?:«|<<|\[\[)?\s*agent-room\s+verdict\s*=\s*(propose|revise|agree)\b(?:\s*;\s*summary\s*=\s*([^\n»>\]]*))?\s*(?:»|>>|\]\])?/i;

export function parseTurn(text: string): ParsedTurn {
  const src = String(text ?? "");
  const m = VERDICT_RE.exec(src);
  if (!m) return { display: src.trim() };
  const display = (src.slice(0, m.index) + src.slice(m.index + m[0].length)).trim();
  const summary = m[2] ? m[2].trim() : undefined;
  return { display, verdict: m[1].toLowerCase() as DebateVerdict, summary: summary || undefined };
}

/** Appended to the proposer's prompt so the orchestrator can read its verdict. */
export const PROPOSER_VERDICT_INSTRUCTION =
  "End your message with this exact line and nothing after it: " +
  "«agent-room verdict=propose; summary=<one-line summary of your plan>». " +
  "Use verdict=revise instead when you are revising an earlier plan.";

/** Appended to the critic's prompt. */
export const CRITIC_VERDICT_INSTRUCTION =
  "End your message with this exact line and nothing after it: " +
  "«agent-room verdict=agree» if the plan is solid with no blocking concerns, or " +
  "«agent-room verdict=revise; summary=<the single biggest remaining issue>» if it still needs work.";

/** Appended to the adversary's prompt (Stage 2 gate). */
export const ADVERSARY_VERDICT_INSTRUCTION =
  "End your message with this exact line and nothing after it: " +
  "«agent-room verdict=agree» if the plan survives your attack with no blocking flaw, or " +
  "«agent-room verdict=revise; summary=<the strongest flaw you found>» if it must go back for changes.";

export interface DebateEntry {
  role: DebateRole;
  round: number;
  /** Display text (verdict trailer stripped). */
  text: string;
  verdict: DebateVerdict;
  summary?: string;
}

export interface RunDebateDeps {
  /** Run one agent turn; returns raw text that may include a verdict trailer. */
  runTurn(input: { role: DebateRole; round: number; cycle: number; history: DebateEntry[] }): Promise<string>;
  /** Emit a completed turn for live display/persistence. */
  emit?(entry: DebateEntry): void | Promise<void>;
  /** Hard cap on debate rounds (one round = proposer + critic). */
  maxRounds: number;
  /** Adversarial cycle this debate belongs to (Stage 2); defaults to 1. */
  cycle?: number;
  /** Prior turns to seed the debate with (carried across adversarial cycles). Not re-emitted. */
  startHistory?: DebateEntry[];
  /** Cooperative cancellation (the Stop button). */
  signal?: { aborted: boolean };
}

export type DebateStatus = "consensus" | "cap" | "aborted";

export interface DebateOutcome {
  status: DebateStatus;
  /** Number of fully completed rounds (proposer + critic). */
  rounds: number;
  /** Proposer's latest one-line summary, when available. */
  planSummary?: string;
  entries: DebateEntry[];
}

/**
 * Run the proposer↔critic debate until the critic agrees, the round cap is
 * hit, or cancellation is requested. Consensus depends only on the critic's
 * verdict; a missing/garbled critic verdict is treated conservatively as
 * `revise` so the loop never ends on ambiguity.
 */
export async function runDebate(deps: RunDebateDeps): Promise<DebateOutcome> {
  // Seed (but never re-emit) prior turns so later adversarial cycles carry context.
  const entries: DebateEntry[] = [...(deps.startHistory ?? [])];
  const aborted = () => deps.signal?.aborted === true;
  const maxRounds = Math.max(1, Math.floor(deps.maxRounds));
  const cycle = deps.cycle ?? 1;
  let planSummary: string | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    if (aborted()) return { status: "aborted", rounds: round - 1, planSummary, entries };

    const propose = parseTurn(await deps.runTurn({ role: "proposer", round, cycle, history: entries }));
    const proposerEntry: DebateEntry = {
      role: "proposer",
      round,
      text: propose.display,
      verdict: propose.verdict ?? (round === 1 ? "propose" : "revise"),
      summary: propose.summary
    };
    if (propose.summary) planSummary = propose.summary;
    entries.push(proposerEntry);
    await deps.emit?.(proposerEntry);

    if (aborted()) return { status: "aborted", rounds: round - 1, planSummary, entries };

    const critique = parseTurn(await deps.runTurn({ role: "critic", round, cycle, history: entries }));
    const criticVerdict: DebateVerdict = critique.verdict === "agree" ? "agree" : "revise";
    const criticEntry: DebateEntry = {
      role: "critic",
      round,
      text: critique.display,
      verdict: criticVerdict,
      summary: critique.summary
    };
    entries.push(criticEntry);
    await deps.emit?.(criticEntry);

    if (criticVerdict === "agree") {
      return { status: "consensus", rounds: round, planSummary, entries };
    }
  }
  return { status: "cap", rounds: maxRounds, planSummary, entries };
}

export interface RunAdversaryDeps {
  /** Run the single adversary turn against the agreed plan. */
  runTurn(input: { role: "adversary"; cycle: number; history: DebateEntry[] }): Promise<string>;
  emit?(entry: DebateEntry): void | Promise<void>;
  cycle: number;
  history: DebateEntry[];
  signal?: { aborted: boolean };
}

export interface AdversaryResult {
  /** True when the adversary could not find a blocking flaw (verdict=agree). */
  passed: boolean;
  entry: DebateEntry;
}

/**
 * One adversarial pass (Stage 2): a third agent attacks the agreed plan. A
 * verdict of `agree` means the plan survived; anything else (incl. a missing
 * verdict) sends it back to debate.
 */
export async function runAdversarialReview(deps: RunAdversaryDeps): Promise<AdversaryResult | undefined> {
  if (deps.signal?.aborted === true) return undefined;
  const parsed = parseTurn(await deps.runTurn({ role: "adversary", cycle: deps.cycle, history: deps.history }));
  const passed = parsed.verdict === "agree";
  const entry: DebateEntry = {
    role: "adversary",
    round: deps.cycle,
    text: parsed.display,
    verdict: passed ? "agree" : "revise",
    summary: parsed.summary
  };
  await deps.emit?.(entry);
  return { passed, entry };
}

export interface RunOrchestrationDeps {
  runTurn(input: { role: DebateRole; round: number; cycle: number; history: DebateEntry[] }): Promise<string>;
  emit?(entry: DebateEntry): void | Promise<void>;
  /** Debate rounds per cycle. */
  maxRounds: number;
  /** Adversarial cycles (debate → attack → maybe back to debate). */
  maxCycles: number;
  signal?: { aborted: boolean };
}

export type OrchestrationStatus = "approved" | "noConsensus" | "adversaryUnresolved" | "aborted";

export interface OrchestrationOutcome {
  status: OrchestrationStatus;
  /** Completed adversarial cycles. */
  cycles: number;
  planSummary?: string;
  entries: DebateEntry[];
}

/**
 * The full Stage 1 + 2 loop: debate to consensus, then an adversarial attack;
 * if the attack finds a blocking flaw, loop back to debate (carrying the
 * findings) until the plan survives or the cycle cap is hit.
 */
export async function runOrchestration(deps: RunOrchestrationDeps): Promise<OrchestrationOutcome> {
  let entries: DebateEntry[] = [];
  let planSummary: string | undefined;
  const aborted = () => deps.signal?.aborted === true;
  const maxCycles = Math.max(1, Math.floor(deps.maxCycles));

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (aborted()) return { status: "aborted", cycles: cycle - 1, planSummary, entries };

    const debate = await runDebate({
      maxRounds: deps.maxRounds,
      signal: deps.signal,
      cycle,
      startHistory: entries,
      emit: deps.emit,
      runTurn: ({ role, round, history }) => deps.runTurn({ role, round, cycle, history })
    });
    entries = debate.entries;
    if (debate.planSummary) planSummary = debate.planSummary;
    if (debate.status === "aborted") return { status: "aborted", cycles: cycle - 1, planSummary, entries };
    if (debate.status === "cap") return { status: "noConsensus", cycles: cycle, planSummary, entries };

    const adversary = await runAdversarialReview({
      cycle,
      history: entries,
      signal: deps.signal,
      emit: deps.emit,
      runTurn: ({ cycle: c, history }) => deps.runTurn({ role: "adversary", round: 0, cycle: c, history })
    });
    if (!adversary) return { status: "aborted", cycles: cycle, planSummary, entries };
    entries.push(adversary.entry);
    if (adversary.passed) return { status: "approved", cycles: cycle, planSummary, entries };
  }
  return { status: "adversaryUnresolved", cycles: maxCycles, planSummary, entries };
}
