/**
 * Virtual team members. A virtual agent is a named participant in the room
 * (Atlas, Forge, …) backed by a provider. Several agents can share one
 * provider — Atlas and Forge both run through the user's Claude Code login,
 * Sentinel and Gauge both run through the user's Codex login.
 */

import { ROLE_IDS } from "./RoleRegistry";
import { ProviderId, ProviderProfile, RoleId, VirtualAgent, VirtualAgentId } from "./Types";
import { DEFAULT_OPERATING_MODE, type OperatingMode } from "./OperatingMode";

export const AGENT_IDS = {
  user: "user",
  atlas: "atlas",
  forge: "forge",
  sentinel: "sentinel",
  gauge: "gauge",
  scout: "scout",
  conductor: "conductor"
} as const;

export function defaultProviders(mode: OperatingMode = DEFAULT_OPERATING_MODE): ProviderProfile[] {
  if (mode === "workCopilotNative") {
    return [
      {
        id: "copilotNative",
        displayName: "GitHub Copilot Native",
        kind: "copilot",
        enabled: true
      },
      {
        id: "copilotCustomAgent",
        displayName: "Copilot Custom Agent",
        kind: "copilot",
        enabled: true
      },
      {
        // Capability-gated scaffold (SPEC §7 Level 3) — disabled until public
        // APIs verifiably support direct session orchestration.
        id: "copilotAgentSession",
        displayName: "Copilot Agent Session",
        kind: "copilot",
        enabled: false
      },
      { id: "human", displayName: "Human", kind: "human", enabled: true },
      { id: "internalConductor", displayName: "Conductor", kind: "internal", enabled: true }
    ];
  }

  return [
    {
      id: "claudeCodeCli",
      displayName: "Claude Code",
      kind: "localCli",
      enabled: true,
      executable: "claude"
    },
    {
      id: "codexCli",
      displayName: "Codex CLI",
      kind: "localCli",
      enabled: true,
      executable: "codex"
    },
    {
      id: "openAiWebSearch",
      displayName: "OpenAI Web Search",
      kind: "apiResearch",
      enabled: false
    },
    { id: "human", displayName: "Human", kind: "human", enabled: true },
    { id: "internalConductor", displayName: "Conductor", kind: "internal", enabled: true }
  ];
}

export function defaultVirtualAgents(mode: OperatingMode = DEFAULT_OPERATING_MODE): VirtualAgent[] {
  const planningProvider: ProviderId = mode === "workCopilotNative" ? "copilotNative" : "claudeCodeCli";
  const codingProvider: ProviderId = mode === "workCopilotNative" ? "copilotNative" : "claudeCodeCli";
  const reviewProvider: ProviderId = mode === "workCopilotNative" ? "copilotNative" : "codexCli";
  const testingProvider: ProviderId = mode === "workCopilotNative" ? "copilotNative" : "codexCli";
  const researchProvider: ProviderId = mode === "workCopilotNative" ? "copilotCustomAgent" : "openAiWebSearch";

  return [
    {
      id: AGENT_IDS.user,
      displayName: "User",
      description: "The human in the room. Product owner and final approver.",
      providerId: "human",
      enabled: true,
      assignedRoleIds: [ROLE_IDS.productOwner, ROLE_IDS.finalApprover]
    },
    {
      id: AGENT_IDS.atlas,
      displayName: "Atlas",
      description: "High-level planner and system designer.",
      providerId: planningProvider,
      enabled: true,
      assignedRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect, ROLE_IDS.explainer],
      preferredModelTier: "balanced"
    },
    {
      id: AGENT_IDS.forge,
      displayName: "Forge",
      description: "Implementation-focused coding agent.",
      providerId: codingProvider,
      enabled: true,
      assignedRoleIds: [ROLE_IDS.coder, ROLE_IDS.documentationWriter],
      preferredModelTier: "coding"
    },
    {
      id: AGENT_IDS.sentinel,
      displayName: "Sentinel",
      description: "Skeptical reviewer and security/code-quality auditor.",
      providerId: reviewProvider,
      enabled: true,
      assignedRoleIds: [
        ROLE_IDS.reviewer,
        ROLE_IDS.securityAuditor,
        ROLE_IDS.codeQualityAuditor
      ],
      preferredModelTier: "review"
    },
    {
      id: AGENT_IDS.gauge,
      displayName: "Gauge",
      description: "Test coverage and verification agent.",
      providerId: testingProvider,
      enabled: true,
      assignedRoleIds: [ROLE_IDS.tester, ROLE_IDS.devOpsReviewer],
      preferredModelTier: "testing"
    },
    {
      id: AGENT_IDS.scout,
      displayName: "Scout",
      description:
        "Optional web research and source-checking agent. Disabled until Web Research is configured.",
      providerId: researchProvider,
      enabled: false,
      assignedRoleIds: [
        ROLE_IDS.webResearcher,
        ROLE_IDS.sourceChecker,
        ROLE_IDS.documentationFinder,
        ROLE_IDS.currentInfoVerifier
      ],
      preferredModelTier: "research"
    },
    {
      id: AGENT_IDS.conductor,
      displayName: "Conductor",
      description: "Internal room moderator and workflow coordinator.",
      providerId: "internalConductor",
      enabled: true,
      assignedRoleIds: [
        ROLE_IDS.moderator,
        ROLE_IDS.workflowCoordinator,
        ROLE_IDS.transcriptSummarizer,
        ROLE_IDS.safetyGatekeeper,
        ROLE_IDS.modelAdvisor
      ]
    }
  ];
}

export class VirtualTeamRegistry {
  private agents: Map<VirtualAgentId, VirtualAgent>;

  constructor(initial?: VirtualAgent[]) {
    this.agents = new Map((initial ?? defaultVirtualAgents()).map((a) => [a.id, a]));
  }

  all(): VirtualAgent[] {
    return [...this.agents.values()];
  }

  get(id: VirtualAgentId): VirtualAgent | undefined {
    return this.agents.get(id);
  }

  getByName(displayName: string): VirtualAgent | undefined {
    const lower = displayName.toLowerCase();
    return this.all().find((a) => a.displayName.toLowerCase() === lower);
  }

  enabledAgents(): VirtualAgent[] {
    return this.all().filter((a) => a.enabled);
  }

  /** Enabled, provider-backed agents that hold any of the given roles. */
  agentsWithAnyRole(roleIds: RoleId[], opts?: { providerId?: ProviderId }): VirtualAgent[] {
    return this.enabledAgents().filter(
      (a) =>
        a.providerId !== "human" &&
        a.providerId !== "internalConductor" &&
        (opts?.providerId === undefined || a.providerId === opts.providerId) &&
        roleIds.some((r) => a.assignedRoleIds.includes(r))
    );
  }

  agentsByProvider(providerId: ProviderId): VirtualAgent[] {
    return this.all().filter((a) => a.providerId === providerId);
  }

  /** First enabled provider-backed agent for a provider (for @claude / @codex). */
  defaultAgentForProvider(providerId: ProviderId): VirtualAgent | undefined {
    return this.enabledAgents().find((a) => a.providerId === providerId);
  }

  setEnabled(id: VirtualAgentId, enabled: boolean): void {
    const agent = this.agents.get(id);
    if (agent) agent.enabled = enabled;
  }

  assignRole(agentId: VirtualAgentId, roleId: RoleId): void {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Team member not found: ${agentId}`);
    if (!agent.assignedRoleIds.includes(roleId)) agent.assignedRoleIds.push(roleId);
  }

  removeRole(agentId: VirtualAgentId, roleId: RoleId): void {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Team member not found: ${agentId}`);
    agent.assignedRoleIds = agent.assignedRoleIds.filter((r) => r !== roleId);
  }

  /** Remove a role id from every agent (used when a custom role is deleted). */
  removeRoleEverywhere(roleId: RoleId): void {
    for (const agent of this.agents.values()) {
      agent.assignedRoleIds = agent.assignedRoleIds.filter((r) => r !== roleId);
    }
  }

  restoreDefaults(): void {
    this.agents = new Map(defaultVirtualAgents().map((a) => [a.id, a]));
  }

  /** Map of providerId -> names of agents sharing that provider's usage pool. */
  sharedProviderUsage(): Map<ProviderId, string[]> {
    const map = new Map<ProviderId, string[]>();
    for (const a of this.all()) {
      if (a.providerId === "human" || a.providerId === "internalConductor") continue;
      const list = map.get(a.providerId) ?? [];
      list.push(a.displayName);
      map.set(a.providerId, list);
    }
    return map;
  }
}
