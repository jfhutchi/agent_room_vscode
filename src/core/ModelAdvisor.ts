import {
  AdvisorAgentPlanEntry,
  EffortLevel,
  ModelAdvisorRecommendation,
  ModelAdvisorSettings,
  ModelTier,
  TaskCategory,
  VirtualAgent
} from "./Types";
import { ROLE_IDS } from "./RoleRegistry";
import { RoleRegistry } from "./RoleRegistry";
import { VirtualTeamRegistry } from "./VirtualTeamRegistry";
import { WorkflowRegistry, WORKFLOW_IDS } from "./WorkflowRegistry";
import { WorkflowRunner } from "./WorkflowRunner";
import { defaultProviders } from "./VirtualTeamRegistry";
import {
  DEFAULT_OPERATING_MODE,
  separationGuardMessage,
  type OperatingMode
} from "./OperatingMode";

export interface ModelAdvisorOptions {
  team: VirtualTeamRegistry;
  roles: RoleRegistry;
  workflows: WorkflowRegistry;
  settings: ModelAdvisorSettings;
  operatingMode?: OperatingMode;
}

export class ModelAdvisor {
  constructor(private readonly options: ModelAdvisorOptions) {}

  recommend(text: string): ModelAdvisorRecommendation {
    const category = this.categorize(text);
    const workflowId = this.workflowFor(category);
    const workflow = this.options.workflows.get(workflowId) ?? this.options.workflows.get(WORKFLOW_IDS.manual);
    if (!workflow) throw new Error("Manual workflow is missing.");

    const warnings: string[] = [];
    const useWebResearch = this.shouldUseScout(category, warnings);
    const agentPlan =
      workflowId === WORKFLOW_IDS.manual
        ? [this.entryForAgent(this.singleAgentFor(category))]
        : new WorkflowRunner({
            team: this.options.team,
            roles: this.options.roles,
            workflows: this.options.workflows,
            providers: defaultProviders(this.operatingMode()),
            operatingMode: this.operatingMode()
          })
            .planWorkflow(workflowId)
            .steps.filter((step) => step.agent)
            .map((step) => this.entryForAgent(step.agent as VirtualAgent));

    if (useWebResearch) {
      const scout = this.options.team.get("scout");
      if (scout && !agentPlan.some((entry) => entry.agentId === scout.id)) {
        agentPlan.unshift(this.entryForAgent(scout));
      }
    }

    // §6 separation guard: when the prompt asks for providers on the other
    // side of the partition, explain the partition instead of suggesting them.
    this.addSeparationGuard(text, warnings);

    // §6: confirm before deep-reasoning tiers and high/max effort when the
    // setting requires it.
    const requiresConfirmation =
      this.options.settings.confirmBeforeDeepReasoning &&
      agentPlan.some(
        (entry) =>
          entry.modelTier === "deepReasoning" ||
          entry.effortLevel === "high" ||
          entry.effortLevel === "max"
      );

    return {
      id: `recommendation-${Date.now()}`,
      category,
      operatingMode: this.operatingMode(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      agentPlan,
      contextLevel: category === "quickQuestion" ? "currentPromptOnly" : "lastMessages",
      safetyMode:
        category === "securityReview" || category === "claimVerification"
          ? "readOnly"
          : "workspaceWriteWithApproval",
      useWebResearch,
      reasoning: this.reasoningFor(category, workflow.name, agentPlan),
      warnings,
      requiresConfirmation
    };
  }

  private categorize(text: string): TaskCategory {
    const lower = text.toLowerCase();
    // Copilot and mode questions are routed before the generic verbs so
    // "generate copilot custom agents" never reads as a build request.
    if (/copilot/.test(lower) && /(custom agent|\.agent\.md|agents? file)/.test(lower)) {
      return "copilotCustomAgentGeneration";
    }
    if (/copilot/.test(lower) && /(capabilit|integration|support|available|detect)/.test(lower)) {
      return "copilotIntegrationCheck";
    }
    if (/(work mode|personal mode|operating mode|which mode|switch mode)/.test(lower)) {
      return "operatingModeSelection";
    }
    if (/(latest|current|docs|documentation|source|web|research)/.test(lower)) return "webResearch";
    if (/(security|audit|vulnerability|secret|credential|injection)/.test(lower)) return "securityReview";
    if (/(build|implement|create|add|fix|complete|extension|feature)/.test(lower)) return "fullBuildCycle";
    if (/(test|coverage|verify|qa)/.test(lower)) return "testing";
    if (/(review|critique|inspect)/.test(lower)) return "adversarialReview";
    if (/(plan|architecture|design)/.test(lower)) return "planning";
    return "quickQuestion";
  }

  private workflowFor(category: TaskCategory): string {
    switch (category) {
      case "copilotCustomAgentGeneration":
        return WORKFLOW_IDS.copilotCustomAgentSync;
      case "copilotIntegrationCheck":
      case "operatingModeSelection":
        return WORKFLOW_IDS.modeSetupProviderCheck;
      case "webResearch":
        return WORKFLOW_IDS.researchPlanReviewCode;
      case "securityReview":
        return WORKFLOW_IDS.securityReview;
      case "testing":
        return WORKFLOW_IDS.testReview;
      case "adversarialReview":
        return WORKFLOW_IDS.adversarialReview;
      case "fullBuildCycle":
        return WORKFLOW_IDS.fullBuildCycle;
      case "planning":
      case "architecture":
        return WORKFLOW_IDS.planReview;
      default:
        return WORKFLOW_IDS.manual;
    }
  }

  private addSeparationGuard(text: string, warnings: string[]): void {
    const lower = text.toLowerCase();
    const mode = this.operatingMode();
    const asksForPersonal = /claude\s*(code)?\s*cli|codex\s*cli|local\s+(claude|codex)/.test(lower);
    const asksForCopilot = /copilot/.test(lower);
    if (mode === "workCopilotNative" && asksForPersonal) {
      warnings.push(separationGuardMessage(mode));
    }
    if (mode === "personalLocal" && asksForCopilot) {
      warnings.push(separationGuardMessage(mode));
    }
  }

  private shouldUseScout(category: TaskCategory, warnings: string[]): boolean {
    if (category !== "webResearch") return false;
    const scout = this.options.team.get("scout");
    if (scout?.enabled) return true;
    warnings.push("Scout is disabled. Enable Web Research before running current-docs research.");
    return false;
  }

  private singleAgentFor(category: TaskCategory): VirtualAgent {
    const role =
      category === "testing"
        ? ROLE_IDS.tester
        : category === "securityReview"
          ? ROLE_IDS.securityAuditor
          : category === "fullBuildCycle"
            ? ROLE_IDS.coder
            : ROLE_IDS.planner;
    return (
      this.options.team.agentsWithAnyRole([role])[0] ??
      this.options.team.enabledAgents().find((agent) => agent.providerId !== "human") ??
      this.options.team.all()[0]
    );
  }

  private entryForAgent(agent: VirtualAgent): AdvisorAgentPlanEntry {
    const roles = this.options.roles.getMany(agent.assignedRoleIds);
    return {
      agentId: agent.id,
      displayName: agent.displayName,
      providerId: agent.providerId,
      roleNames: roles.map((role) => role.name),
      modelTier: this.modelTierFor(agent),
      effortLevel: this.effortLevelFor(agent)
    };
  }

  private modelTierFor(agent: VirtualAgent): ModelTier {
    if (this.options.settings.preferSpeed) return "fast";
    if (this.options.settings.preferQuality) return "deepReasoning";
    return agent.preferredModelTier ?? "providerDefault";
  }

  private effortLevelFor(agent: VirtualAgent): EffortLevel {
    if (this.options.settings.preferSpeed) return "low";
    if (this.options.settings.preferQuality) return "high";
    return agent.effortLevel ?? "medium";
  }

  /** Mode-aware reasoning matching the §6 example shapes. */
  private reasoningFor(
    category: TaskCategory,
    workflowName: string,
    agentPlan: AdvisorAgentPlanEntry[]
  ): string {
    const participants = agentPlan.map((entry) => entry.displayName).join(", ") || "the Conductor";
    return this.operatingMode() === "workCopilotNative"
      ? `This looks like a ${category} task in a work repository. I recommend Work Mode's ` +
          `${workflowName} with ${participants} using company-approved Copilot models.`
      : `This looks like a personal ${category} task. I recommend ${workflowName} with ` +
          `${participants} through your local Claude Code and Codex CLI logins.`;
  }

  private operatingMode(): OperatingMode {
    return this.options.operatingMode ?? DEFAULT_OPERATING_MODE;
  }
}
