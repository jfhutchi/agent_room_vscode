/**
 * `copilotCustomAgent` provider (SPEC §4): represents the generated
 * `.github/agents/*.agent.md` files. Per spec this provider "does not imply
 * direct session control" — Agent Room cannot invoke a Copilot custom agent
 * session through any public API, so `runTurn` says exactly that instead of
 * faking a result. Health reports whether the generated files exist on disk.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { ProviderId } from "./Types";
import { Provider, ProviderHealth, ProviderInvocation, ProviderResult } from "./ProviderTypes";
import { CUSTOM_AGENT_FILE_SPECS } from "./CopilotCustomAgentGenerator";
import { DIRECT_SESSION_LIMITATION } from "./CopilotIntegration";

export interface CopilotCustomAgentProviderOptions {
  workspaceRoot?: string;
  /** Relative to workspaceRoot, or absolute (agentRoom.copilotIntegration.customAgentsDirectory). */
  customAgentsDirectory: string;
}

export const CUSTOM_AGENT_TURN_MESSAGE =
  "Copilot custom agents run inside GitHub Copilot Chat (invoke them there by name, e.g. " +
  "@atlas-planner). Agent Room generates and maintains the agent files but cannot invoke " +
  "a Copilot agent session directly. " +
  DIRECT_SESSION_LIMITATION;

export class CopilotCustomAgentProvider implements Provider {
  readonly id: ProviderId = "copilotCustomAgent";
  readonly displayName = "Copilot Custom Agent";
  readonly kind = "copilot";
  readonly enabled = true;
  readonly supportedModes = ["workCopilotNative"] as const;

  constructor(private readonly options: CopilotCustomAgentProviderOptions) {}

  directory(): string | undefined {
    if (!this.options.workspaceRoot) return undefined;
    return path.isAbsolute(this.options.customAgentsDirectory)
      ? this.options.customAgentsDirectory
      : path.join(this.options.workspaceRoot, this.options.customAgentsDirectory);
  }

  async healthCheck(): Promise<ProviderHealth> {
    const health: ProviderHealth = {
      providerId: this.id,
      available: false,
      configured: false,
      authenticatedLikely: false,
      capabilities: {},
      warnings: [],
      checkedAt: new Date().toISOString()
    };
    const directory = this.directory();
    if (!directory) {
      health.warnings.push("Open a workspace folder to generate Copilot custom agent files.");
      return health;
    }
    health.available = true;
    const missing: string[] = [];
    for (const spec of CUSTOM_AGENT_FILE_SPECS) {
      try {
        await fs.access(path.join(directory, spec.fileName));
      } catch {
        missing.push(spec.fileName);
      }
    }
    if (missing.length === 0) {
      health.configured = true;
      health.authenticatedLikely = true;
      health.versionText = `${CUSTOM_AGENT_FILE_SPECS.length} agent files in ${directory}`;
    } else {
      health.warnings.push(
        `Custom agent files not generated yet (missing: ${missing.join(", ")}). ` +
          'Run "Agent Room: Generate Copilot Custom Agents".'
      );
    }
    return health;
  }

  async runTurn(invocation: ProviderInvocation): Promise<ProviderResult> {
    // Honest false beats fake true: there is no public API to run a Copilot
    // custom agent session from an extension, so no turn is ever simulated.
    return {
      providerId: this.id,
      virtualAgentId: invocation.virtualAgentId,
      status: "error",
      finalText: CUSTOM_AGENT_TURN_MESSAGE,
      diagnostics: {},
      durationMs: 0,
      fallbackUsed: false,
      warnings: []
    };
  }
}
