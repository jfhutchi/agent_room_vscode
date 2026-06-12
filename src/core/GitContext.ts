import { runCommand } from "../utils/childProcess";

export interface GitContext {
  available: boolean;
  branch?: string;
  statusSummary?: string;
  diffStat?: string;
  error?: string;
}

export async function collectGitContext(workspaceRoot: string, timeoutMs = 5000): Promise<GitContext> {
  const branch = await runCommand({
    executable: "git",
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd: workspaceRoot,
    timeoutMs,
    label: "git branch"
  });
  if (branch.exitCode !== 0) {
    return { available: false, error: branch.stderr || branch.errorMessage };
  }
  const status = await runCommand({
    executable: "git",
    args: ["status", "--short"],
    cwd: workspaceRoot,
    timeoutMs,
    label: "git status"
  });
  const diff = await runCommand({
    executable: "git",
    args: ["diff", "--stat"],
    cwd: workspaceRoot,
    timeoutMs,
    label: "git diff --stat"
  });
  return {
    available: true,
    branch: branch.stdout.trim(),
    statusSummary: status.stdout.trim() || "clean",
    diffStat: diff.stdout.trim()
  };
}
