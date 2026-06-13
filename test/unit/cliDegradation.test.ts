import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeArgs,
  ClaudeCodeProvider,
  CLAUDE_NOT_AVAILABLE_MESSAGE
} from "../../src/core/ClaudeCodeProvider";
import {
  buildCodexArgs,
  CodexCliProvider,
  CODEX_NOT_AVAILABLE_MESSAGE
} from "../../src/core/CodexCliProvider";
import type { ProviderCapabilities, ProviderInvocation } from "../../src/core/ProviderTypes";

const fullClaudeCaps: ProviderCapabilities = {
  print: true,
  outputFormat: true,
  streamJson: true,
  json: true,
  model: true,
  stdinPrompt: true
};

const fullCodexCaps: ProviderCapabilities = {
  exec: true,
  cd: true,
  sandbox: true,
  askForApproval: true,
  jsonl: true,
  model: true,
  stdinPrompt: true
};

const prefs = { preferStreamJson: true, preferJson: true };

test("Claude ladder: full capabilities give stream-json", () => {
  const built = buildClaudeArgs(prefs, fullClaudeCaps);
  assert.deepEqual(built.args, ["-p", "--output-format", "stream-json"]);
  assert.equal(built.format, "stream-json");
});

test("Claude ladder: no stream-json degrades to json with a warning", () => {
  const built = buildClaudeArgs(prefs, { ...fullClaudeCaps, streamJson: false });
  assert.deepEqual(built.args, ["-p", "--output-format", "json"]);
  assert.equal(built.format, "json");
  assert.match(built.warnings.join("\n"), /degraded to json/);
});

test("Claude ladder: no --output-format degrades to plain -p", () => {
  const built = buildClaudeArgs(prefs, { ...fullClaudeCaps, outputFormat: false });
  assert.deepEqual(built.args, ["-p"]);
  assert.equal(built.format, "plain");
  assert.match(built.warnings.join("\n"), /plain text/);
});

test("Claude ladder: unknown capabilities trust the user's preferences", () => {
  assert.equal(buildClaudeArgs(prefs, undefined).format, "stream-json");
  assert.equal(
    buildClaudeArgs({ preferStreamJson: false, preferJson: true }, undefined).format,
    "json"
  );
  assert.equal(
    buildClaudeArgs({ preferStreamJson: false, preferJson: false }, undefined).format,
    "plain"
  );
});

test("Claude ladder: model flag only when supported", () => {
  assert.deepEqual(buildClaudeArgs(prefs, fullClaudeCaps, "opus").args.slice(-2), ["--model", "opus"]);
  const noModel = buildClaudeArgs(prefs, { ...fullClaudeCaps, model: false }, "opus");
  assert.equal(noModel.args.includes("--model"), false);
  assert.match(noModel.warnings.join("\n"), /provider default/);
});

test("Codex ladder: full capabilities give the preferred exec shape", () => {
  const built = buildCodexArgs(
    { useJson: true, sandbox: "workspace-write", approval: "on-request" },
    fullCodexCaps,
    { workspaceRoot: "/repo", safetyMode: "workspaceWriteWithApproval" }
  );
  assert.deepEqual(built.args, [
    "exec",
    "--cd",
    "/repo",
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "on-request",
    "--json",
    "-"
  ]);
  assert.equal(built.json, true);
});

test("Codex ladder: unsupported --cd and --json are omitted, plain parse", () => {
  const built = buildCodexArgs(
    { useJson: true, sandbox: "workspace-write", approval: "on-request" },
    { ...fullCodexCaps, cd: false, jsonl: false },
    { workspaceRoot: "/repo", safetyMode: "workspaceWriteWithApproval" }
  );
  assert.equal(built.args.includes("--cd"), false);
  assert.equal(built.args.includes("--json"), false);
  assert.equal(built.json, false);
  assert.match(built.warnings.join("\n"), /parsing plain text/);
});

test("Codex ladder: read-only safety mode forces a read-only sandbox", () => {
  const built = buildCodexArgs(
    { useJson: true, sandbox: "workspace-write", approval: "on-request" },
    fullCodexCaps,
    { workspaceRoot: "/repo", safetyMode: "readOnly" }
  );
  const sandboxIndex = built.args.indexOf("--sandbox");
  assert.equal(built.args[sandboxIndex + 1], "read-only");
});

test("dangerous flags smuggled through a model name are blocked before spawning", async () => {
  const invocation = (providerId: string): ProviderInvocation => ({
    providerId,
    virtualAgentId: "forge",
    prompt: "hello",
    safetyMode: "workspaceWriteWithApproval",
    modelTier: "userSelected",
    concreteModelName: "--dangerously-skip-permissions",
    timeoutMs: 1000
  });

  const claude = new ClaudeCodeProvider({
    executable: "agent-room-missing-cli",
    timeoutMs: 1000,
    preferStreamJson: true,
    preferJson: true
  });
  const claudeResult = await claude.runTurn(invocation("claudeCodeCli"));
  assert.equal(claudeResult.status, "error");
  assert.match(claudeResult.finalText, /Blocked dangerous flag/);

  const codex = new CodexCliProvider({
    executable: "agent-room-missing-cli",
    timeoutMs: 1000,
    useJson: true,
    sandbox: "workspace-write",
    approval: "on-request"
  });
  const codexResult = await codex.runTurn(invocation("codexCli"));
  assert.equal(codexResult.status, "error");
  assert.match(codexResult.finalText, /Blocked dangerous flag/);
});

test("health checks use the canonical §12 friendly strings when the CLI is missing", async () => {
  const claude = new ClaudeCodeProvider({
    executable: "agent-room-missing-cli",
    timeoutMs: 2000,
    preferStreamJson: true,
    preferJson: true
  });
  const claudeHealth = await claude.healthCheck();
  assert.equal(claudeHealth.available, false);
  assert.equal(claudeHealth.warnings.includes(CLAUDE_NOT_AVAILABLE_MESSAGE), true);
  // The health check caches capabilities for later runTurn calls.
  assert.notEqual(claude.cachedCapabilities(), undefined);

  const codex = new CodexCliProvider({
    executable: "agent-room-missing-cli",
    timeoutMs: 2000,
    useJson: true,
    sandbox: "workspace-write",
    approval: "on-request"
  });
  const codexHealth = await codex.healthCheck();
  assert.equal(codexHealth.warnings.includes(CODEX_NOT_AVAILABLE_MESSAGE), true);
});
