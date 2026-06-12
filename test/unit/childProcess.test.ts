import assert from "node:assert/strict";
import test from "node:test";
import { runCommand } from "../../src/utils/childProcess";
import { redactText } from "../../src/utils/redaction";

const nodeExe = process.execPath;

test("child process runner passes args as an array", async () => {
  const result = await runCommand({
    executable: nodeExe,
    args: ["-e", "process.stdout.write(process.argv[1])", "hello"],
    timeoutMs: 5000
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "hello");
});

test("child process runner handles timeouts", async () => {
  const result = await runCommand({
    executable: nodeExe,
    args: ["-e", "setTimeout(() => {}, 10000)"],
    timeoutMs: 50
  });

  assert.equal(result.timedOut, true);
});

test("child process runner handles cancellation", async () => {
  const controller = new AbortController();
  const promise = runCommand({
    executable: nodeExe,
    args: ["-e", "setTimeout(() => {}, 10000)"],
    timeoutMs: 5000,
    abortSignal: controller.signal
  });
  controller.abort();

  const result = await promise;
  assert.equal(result.cancelled, true);
});

test("redaction hides obvious secrets", () => {
  assert.equal(redactText("Authorization: Bearer sk-secretsecretsecret"), "Authorization: Bearer [redacted]");
});
