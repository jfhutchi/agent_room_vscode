import assert from "node:assert/strict";
import test from "node:test";
import { parseTurn, runDebate, type DebateEntry } from "../../src/core/Orchestrator";

test("parseTurn extracts verdict + summary and strips the trailer", () => {
  const r = parseTurn("Here is my plan.\n\n«agent-room verdict=propose; summary=Add a debounce helper»");
  assert.equal(r.verdict, "propose");
  assert.equal(r.summary, "Add a debounce helper");
  assert.equal(r.display, "Here is my plan.");
  assert.equal(r.display.includes("agent-room"), false);
});

test("parseTurn handles agree with no summary", () => {
  const r = parseTurn("Looks good to me.\n«agent-room verdict=agree»");
  assert.equal(r.verdict, "agree");
  assert.equal(r.summary, undefined);
  assert.equal(r.display, "Looks good to me.");
});

test("parseTurn tolerates alternate delimiters and plain (no brackets)", () => {
  assert.equal(parseTurn("x <<agent-room verdict=revise; summary=needs tests>>").verdict, "revise");
  assert.equal(parseTurn("y\nagent-room verdict=agree").verdict, "agree");
});

test("parseTurn with no trailer returns display only", () => {
  const r = parseTurn("Just a plain message with no verdict.");
  assert.equal(r.verdict, undefined);
  assert.equal(r.display, "Just a plain message with no verdict.");
});

test("runDebate reaches consensus when the critic agrees", async () => {
  const emitted: string[] = [];
  const outcome = await runDebate({
    maxRounds: 6,
    emit: (e: DebateEntry) => {
      emitted.push(`${e.role}#${e.round}:${e.verdict}`);
    },
    runTurn: async ({ role, round }) =>
      role === "proposer"
        ? `Plan v${round}. «agent-room verdict=${round === 1 ? "propose" : "revise"}; summary=plan ${round}»`
        : round === 1
          ? "Needs tests. «agent-room verdict=revise; summary=add tests»"
          : "Good now. «agent-room verdict=agree»"
  });

  assert.equal(outcome.status, "consensus");
  assert.equal(outcome.rounds, 2);
  assert.equal(outcome.planSummary, "plan 2");
  assert.deepEqual(emitted, [
    "proposer#1:propose",
    "critic#1:revise",
    "proposer#2:revise",
    "critic#2:agree"
  ]);
  assert.equal(outcome.entries.length, 4);
  assert.equal(outcome.entries[0].text, "Plan v1."); // trailer stripped
});

test("runDebate stops at the round cap without consensus", async () => {
  const outcome = await runDebate({
    maxRounds: 3,
    runTurn: async ({ role }) =>
      role === "proposer"
        ? "Plan. «agent-room verdict=propose; summary=p»"
        : "Still issues. «agent-room verdict=revise; summary=nope»"
  });

  assert.equal(outcome.status, "cap");
  assert.equal(outcome.rounds, 3);
  assert.equal(outcome.entries.length, 6);
});

test("a missing critic verdict is treated as revise, never as agreement", async () => {
  let criticCalls = 0;
  const outcome = await runDebate({
    maxRounds: 2,
    runTurn: async ({ role }) => {
      if (role === "proposer") return "Plan. «agent-room verdict=propose; summary=p»";
      criticCalls++;
      return "I have thoughts but forgot the trailer entirely.";
    }
  });

  assert.equal(outcome.status, "cap");
  assert.equal(criticCalls, 2);
  assert.equal(
    outcome.entries.filter((e) => e.role === "critic").every((e) => e.verdict === "revise"),
    true
  );
});

test("runDebate honors cooperative cancellation mid-loop", async () => {
  const signal = { aborted: false };
  let calls = 0;
  const outcome = await runDebate({
    maxRounds: 6,
    signal,
    runTurn: async ({ role }) => {
      calls++;
      if (role === "proposer") signal.aborted = true; // user hits Stop after the first turn
      return role === "proposer"
        ? "Plan. «agent-room verdict=propose; summary=p»"
        : "Critique. «agent-room verdict=revise»";
    }
  });

  assert.equal(outcome.status, "aborted");
  assert.equal(calls, 1); // proposer ran once; critic never reached
});

test("runDebate clamps a nonsensical round cap to at least one", async () => {
  const outcome = await runDebate({
    maxRounds: 0,
    runTurn: async ({ role }) =>
      role === "proposer"
        ? "Plan. «agent-room verdict=propose»"
        : "Fine. «agent-room verdict=agree»"
  });
  assert.equal(outcome.status, "consensus");
  assert.equal(outcome.rounds, 1);
});
