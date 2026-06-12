import {
  AdvisorAgentPlanEntry,
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

export interface ModelAdvisorOptions {
  team: VirtualTeamRegistry;
  roles: RoleRegistry;
  workflows: WorkflowRegistry;
  settings: ModelAdvisorSettings;
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
            providers: defaultProviders()
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

    const requiresConfirmation =
      this.options.settings.confirmBeforeDeepReasoning &&
      agentPlan.some((entry) => entry.modelTier === "deepReasoning");

    return {
      id: `recommendation-${Date.now()}`,
      category,
      workflowId: workflow.id,
      workflowName: workflow.name,
      agentPlan,
      contextLevel: category === "quickQuestion" ? "currentPromptOnly" : "lastMessages",
      safetyMode:
        category === "securityReview" || category === "claimVerification"
          ? "readOnly"
          : "workspaceWriteWithApproval",
      useWebResearch,
      reasoning: this.reasoningFor(category, workflow.name),
      warnings,
      requiresConfirmation
    };
  }

  private categorize(text: string): TaskCategory {
    const lower = text.toLowerCase();
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
      modelTier: this.modelTierFor(agent)
    };
  }

  private modelTierFor(agent: VirtualAgent): ModelTier {
    if (this.options.settings.preferSpeed) return "fast";
    if (this.options.settings.preferQuality) return "deepReasoning";
    return agent.preferredModelTier ?? "providerDefault";
  }

  private reasoningFor(category: TaskCategory, workflowName: string): string {
    return `Classified as ${category}; recommended ${workflowName} with assigned role holders.`;
  }
}
