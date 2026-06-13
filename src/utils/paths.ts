/**
 * Paths and on-disk layout for the per-workspace `.agent-room/` folder.
 * Directories are created lazily, only when something is actually stored.
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface AgentRoomDirs {
  root: string;
  transcripts: string;
  profiles: string;
  workflows: string;
  cache: string;
}

function agentRoomDirs(workspaceRoot: string): AgentRoomDirs {
  const root = path.join(workspaceRoot, ".agent-room");
  return {
    root,
    transcripts: path.join(root, "transcripts"),
    profiles: path.join(root, "profiles"),
    workflows: path.join(root, "workflows"),
    cache: path.join(root, "cache")
  };
}

const ROOT_README = `# .agent-room

This folder is created by the Agent Room VS Code extension.

- \`transcripts/\` — saved room transcripts (git-ignored)
- \`profiles/\` — room profiles: team members, roles, workflows
- \`workflows/\` — custom workflow definitions
- \`cache/\` — provider capability cache (git-ignored)

Profiles and workflows are safe to commit if you want to share your room
setup with teammates. Transcripts and cache are ignored by default.
`;

const ROOT_GITIGNORE = `transcripts/
cache/
`;

/** Ensure `.agent-room/` and the requested subdirectory exist. */
export async function ensureAgentRoomDir(
  workspaceRoot: string,
  sub: keyof Omit<AgentRoomDirs, "root">
): Promise<string> {
  const dirs = agentRoomDirs(workspaceRoot);
  await fs.mkdir(dirs.root, { recursive: true });
  await writeIfMissing(path.join(dirs.root, "README.md"), ROOT_README);
  await writeIfMissing(path.join(dirs.root, ".gitignore"), ROOT_GITIGNORE);
  await fs.mkdir(dirs[sub], { recursive: true });
  return dirs[sub];
}

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, "utf8");
  }
}

/** Turn an arbitrary id into a safe file name. */
export function safeFileName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}
