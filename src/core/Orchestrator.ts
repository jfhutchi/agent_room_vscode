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
export type DebateRole = "proposer" | "critic";

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
  runTurn(input: { role: DebateRole; round: number; history: DebateEntry[] }): Promise<string>;
  /** Emit a completed turn for live display/persistence. */
  emit?(entry: DebateEntry): void | Promise<void>;
  /** Hard cap on debate rounds (one round = proposer + critic). */
  maxRounds: number;
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
  const entries: DebateEntry[] = [];
  const aborted = () => deps.signal?.aborted === true;
  const maxRounds = Math.max(1, Math.floor(deps.maxRounds));
  let planSummary: string | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    if (aborted()) return { status: "aborted", rounds: round - 1, planSummary, entries };

    const propose = parseTurn(await deps.runTurn({ role: "proposer", round, history: entries }));
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

    const critique = parseTurn(await deps.runTurn({ role: "critic", round, history: entries }));
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
