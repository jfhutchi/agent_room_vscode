/**
 * Room profile persistence: team members, roles, workflows, and provider
 * profiles. Workspace mode writes `.agent-room/profiles/room-profile.json`
 * (safe to commit and share); global mode uses a memento-like store.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { builtInRoles } from "./RoleRegistry";
import { defaultProviders, defaultVirtualAgents } from "./VirtualTeamRegistry";
import { builtInWorkflows, WORKFLOW_IDS } from "./WorkflowRegistry";
import { newId, RoomProfile } from "./Types";
import { ensureAgentRoomDir } from "../utils/paths";

const PROFILE_FILE = "room-profile.json";

export function createDefaultRoomProfile(): RoomProfile {
  return {
    id: newId("profile"),
    name: "Default Room",
    description: "Default Agent Room team: Atlas, Forge, Sentinel, Gauge, Scout, Conductor.",
    providers: defaultProviders(),
    virtualAgents: defaultVirtualAgents(),
    roles: builtInRoles(),
    workflows: builtInWorkflows(),
    defaultWorkflowId: WORKFLOW_IDS.manual,
    extraRoomInstructions: ""
  };
}

/** Minimal key-value store interface (satisfied by vscode.Memento). */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface RoomProfileStoreOptions {
  mode: "workspace" | "global";
  workspaceRoot?: string;
  globalStore?: KeyValueStore;
}

const GLOBAL_KEY = "agentRoom.roomProfile";

export class RoomProfileStore {
  constructor(private readonly options: RoomProfileStoreOptions) {}

  async load(): Promise<RoomProfile> {
    try {
      if (this.options.mode === "workspace" && this.options.workspaceRoot) {
        const file = path.join(
          this.options.workspaceRoot,
          ".agent-room",
          "profiles",
          PROFILE_FILE
        );
        const text = await fs.readFile(file, "utf8");
        return this.validate(JSON.parse(text));
      }
      if (this.options.mode === "global" && this.options.globalStore) {
        const stored = this.options.globalStore.get<RoomProfile>(GLOBAL_KEY);
        if (stored) return this.validate(stored);
      }
    } catch {
      // Missing or corrupt profile -> fall through to defaults.
    }
    return createDefaultRoomProfile();
  }

  async save(profile: RoomProfile): Promise<void> {
    if (this.options.mode === "workspace" && this.options.workspaceRoot) {
      const dir = await ensureAgentRoomDir(this.options.workspaceRoot, "profiles");
      await fs.writeFile(
        path.join(dir, PROFILE_FILE),
        JSON.stringify(profile, null, 2),
        "utf8"
      );
      return;
    }
    if (this.options.globalStore) {
      await this.options.globalStore.update(GLOBAL_KEY, profile);
    }
  }

  serialize(profile: RoomProfile): string {
    return JSON.stringify(profile, null, 2);
  }

  /** Parse and structurally validate an imported profile. Throws on garbage. */
  parseImported(text: string): RoomProfile {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error("That file is not valid JSON.");
    }
    return this.validate(raw);
  }

  private validate(raw: unknown): RoomProfile {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Profile must be a JSON object.");
    }
    const p = raw as Partial<RoomProfile>;
    if (!Array.isArray(p.virtualAgents) || !Array.isArray(p.roles)) {
      throw new Error("Profile is missing virtualAgents or roles.");
    }
    const defaults = createDefaultRoomProfile();
    // Merge tolerant: anything missing falls back to defaults so old exports
    // keep working after upgrades.
    return {
      id: typeof p.id === "string" ? p.id : defaults.id,
      name: typeof p.name === "string" ? p.name : defaults.name,
      description: typeof p.description === "string" ? p.description : defaults.description,
      providers: Array.isArray(p.providers) && p.providers.length > 0 ? p.providers : defaults.providers,
      virtualAgents: p.virtualAgents,
      roles: p.roles,
      workflows:
        Array.isArray(p.workflows) && p.workflows.length > 0 ? p.workflows : defaults.workflows,
      defaultWorkflowId:
        typeof p.defaultWorkflowId === "string" ? p.defaultWorkflowId : defaults.defaultWorkflowId,
      extraRoomInstructions:
        typeof p.extraRoomInstructions === "string" ? p.extraRoomInstructions : ""
    };
  }
}
