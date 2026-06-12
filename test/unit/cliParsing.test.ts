import assert from "node:assert/strict";
import test from "node:test";
import { parseClaudeOutput } from "../../src/core/ClaudeCodeProvider";
import { parseCodexOutput } from "../../src/core/CodexCliProvider";

test("Claude parser handles plain stdout", () => {
  const parsed = parseClaudeOutput("plain answer", true);

  assert.equal(parsed.text, "plain answer");
  assert.equal(parsed.fallbackUsed, true);
});

test("Claude parser tolerates JSON lines", () => {
  const parsed = parseClaudeOutput('{"type":"assistant","message":{"content":[{"text":"hello"}]}}\n', true);

  assert.match(parsed.text, /hello/);
  assert.equal(parsed.events.length, 1);
});

test("Codex parser handles JSONL and unknown events", () => {
  const output = [
    '{"type":"agent_message","message":"first"}',
    '{"type":"unknown","payload":{"ignored":true}}',
    '{"msg":{"type":"agent_message","message":"second"}}'
  ].join("\n");

  const parsed = parseCodexOutput(output, true);

  assert.match(parsed.text, /first/);
  assert.match(parsed.text, /second/);
  assert.equal(parsed.events.length, 3);
});

test("Codex parser falls back to raw stdout", () => {
  const parsed = parseCodexOutput("raw text", true);

  assert.equal(parsed.text, "raw text");
  assert.equal(parsed.fallbackUsed, true);
});
