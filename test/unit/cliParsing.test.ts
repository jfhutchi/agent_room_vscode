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

test("Claude parser ignores hook/system noise and returns only the assistant answer", () => {
  // Real-world stream-json: SessionStart hooks dump Bun errors and SDK metrics
  // in `output`/`stderr` fields. None of that may leak into the reply.
  const output = [
    '{"type":"system","subtype":"hook_response","output":"Error: Bun not found. Please install Bun\\n{\\"continue\\":true}","stderr":"printf: write error: Permission denied"}',
    '{"type":"system","subtype":"hook_progress","output":"{\\"metrics\\":{\\"sdk_bootstrap\\":1}}"}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"PONG"}]}}',
    '{"type":"result","subtype":"success","result":"PONG"}'
  ].join("\n");

  const parsed = parseClaudeOutput(output, true);

  assert.equal(parsed.text, "PONG");
  assert.equal(parsed.text.includes("Bun"), false);
  assert.equal(parsed.text.includes("metrics"), false);
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
