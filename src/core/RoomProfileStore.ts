/**
 * Room profile persistence: team members, roles, workflows, and provider
 * profiles. Workspace mode writes per-mode files under `.agent-room/profiles/`
 * (safe to commit and share); global mode uses a memento-like store.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { builtInRoles } from "./RoleRegistry";
import { defaultProviders, defaultVirtualAgents } from "./VirtualTeamRegistry";
import { builtInWorkflows, WORKFLOW_IDS } from "./WorkflowRegistry";
import { newId, type RoomProfile, type ProviderProfile, type VirtualAgent } from "./Types";
import { ensureAgentRoomDir } from "../utils/paths";
import {
  DEFAULT_OPERATING_MODE,
  type OperatingMode,
  isProviderValidForMode,
  modeName,
  profileFileNameForMode
} from "./OperatingMode";

export function createDefaultRoomProfile(operatingMode: OperatingMode = DEFAULT_OPERATING_MODE): RoomProfile {
  return {
    id: newId("profile"),
    name: "Default Room",
    description: "Default Agent Room team: Atlas, Forge, Sentinel, Gauge, Scout, Conductor.",
    providers: defaultProviders(operatingMode),
    virtualAgents: defaultVirtualAgents(operatingMode),
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
  operatingMode?: OperatingMode;
  workspaceRoot?: string;
  globalStore?: KeyValueStore;
}

const GLOBAL_KEY = "agentRoom.roomProfile";

export class RoomProfileStore {
  constructor(private readonly options: RoomProfileStoreOptions) {}

  async load(): Promise<RoomProfile> {
    if (this.options.mode === "workspace" && this.options.workspaceRoot) {
      const file = path.join(
        this.options.workspaceRoot,
        ".agent-room",
        "profiles",
        profileFileNameForMode(this.operatingMode())
      );
      try {
        const text = await fs.readFile(file, "utf8");
        return this.validate(JSON.parse(text));
      } catch (error) {
        if (isMissingFileError(error)) return createDefaultRoomProfile(this.operatingMode());
        throw error;
      }
    }
    if (this.options.mode === "global" && this.options.globalStore) {
      const stored = this.options.globalStore.get<RoomProfile>(this.globalKey());
      if (stored) return this.validate(stored);
    }
    return createDefaultRoomProfile(this.operatingMode());
  }

  async save(profile: RoomProfile): Promise<void> {
    const validated = this.validate(profile);
    if (this.options.mode === "workspace" && this.options.workspaceRoot) {
      const dir = await ensureAgentRoomDir(this.options.workspaceRoot, "profiles");
      await fs.writeFile(
        path.join(dir, profileFileNameForMode(this.operatingMode())),
        JSON.stringify(validated, null, 2),
        "utf8"
      );
      return;
    }
    if (this.options.globalStore) {
      await this.options.globalStore.update(this.globalKey(), validated);
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
    const defaults = createDefaultRoomProfile(this.operatingMode());
    const providers =
      Array.isArray(p.providers) && p.providers.length > 0 ? p.providers : defaults.providers;
    const virtualAgents = p.virtualAgents;
    this.validateModeProviderReferences(providers, virtualAgents);
    // Refresh structural flags on built-in roles from the canonical definitions
    // (e.g. `singleton`), so profiles saved before a flag existed still pick it
    // up — without clobbering user-edited name/description/instructions.
    const builtInSingleton = new Map(builtInRoles().map((role) => [role.id, role.singleton === true]));
    const roles = p.roles.map((role) =>
      builtInSingleton.has(role.id) ? { ...role, singleton: builtInSingleton.get(role.id) } : role
    );
    // Merge tolerant: anything missing falls back to defaults so old exports
    // keep working after upgrades.
    return {
      id: typeof p.id === "string" ? p.id : defaults.id,
      name: typeof p.name === "string" ? p.name : defaults.name,
      description: typeof p.description === "string" ? p.description : defaults.description,
      providers,
      virtualAgents,
      roles,
      workflows:
        Array.isArray(p.workflows) && p.workflows.length > 0 ? p.workflows : defaults.workflows,
      defaultWorkflowId:
        typeof p.defaultWorkflowId === "string" ? p.defaultWorkflowId : defaults.defaultWorkflowId,
      extraRoomInstructions:
        typeof p.extraRoomInstructions === "string" ? p.extraRoomInstructions : ""
    };
  }

  private validateModeProviderReferences(
    providers: ProviderProfile[],
    virtualAgents: VirtualAgent[]
  ): void {
    const mode = this.operatingMode();
    const validProviderIds = new Set<string>();
    for (const provider of providers) {
      if (!isProviderValidForMode(provider.id, mode)) {
        throw new Error(`Provider ${provider.id} is not valid in ${modeName(mode)}.`);
      }
      validProviderIds.add(provider.id);
    }
    for (const agent of virtualAgents) {
      if (!isProviderValidForMode(agent.providerId, mode)) {
        throw new Error(`Provider ${agent.providerId} is not valid in ${modeName(mode)}.`);
      }
      if (!validProviderIds.has(agent.providerId)) {
        throw new Error(`Profile references unknown provider ${agent.providerId}.`);
      }
    }
  }

  private operatingMode(): OperatingMode {
    return this.options.operatingMode ?? DEFAULT_OPERATING_MODE;
  }

  private globalKey(): string {
    return `${GLOBAL_KEY}.${this.operatingMode()}`;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
