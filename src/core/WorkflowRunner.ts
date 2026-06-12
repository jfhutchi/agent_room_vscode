import {
  ProviderProfile,
  SafetyMode,
  VirtualAgent,
  WorkflowDefinition,
  WorkflowStep
} from "./Types";
import { RoleRegistry } from "./RoleRegistry";
import { VirtualTeamRegistry } from "./VirtualTeamRegistry";
import { WorkflowRegistry } from "./WorkflowRegistry";
import { SafetyPolicy } from "./SafetyPolicy";

export interface WorkflowRunnerOptions {
  team: VirtualTeamRegistry;
  roles: RoleRegistry;
  workflows: WorkflowRegistry;
  providers: ProviderProfile[];
}

export interface PlannedWorkflowStep {
  step: WorkflowStep;
  agent?: VirtualAgent;
  roleNames: string[];
}

export interface PlannedWorkflow {
  workflow: WorkflowDefinition;
  steps: PlannedWorkflowStep[];
}

export interface WorkflowValidation {
  blocked: boolean;
  errors: string[];
  warnings: string[];
  plan: PlannedWorkflow;
}

export class WorkflowRunner {
  constructor(private readonly options: WorkflowRunnerOptions) {}

  planWorkflow(workflowId: string): PlannedWorkflow {
    const workflow = this.workflow(workflowId);
    return {
      workflow,
      steps: workflow.steps.map((step) => ({
        step,
        agent: this.resolveAgent(step),
        roleNames: this.options.roles.getMany(step.anyOfRoleIds).map((role) => role.name)
      }))
    };
  }

  validateWorkflow(workflowId: string, safetyMode: SafetyMode): WorkflowValidation {
    const plan = this.planWorkflow(workflowId);
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const planned of plan.steps) {
      if (planned.step.speaker === "conductor" || planned.step.optional) continue;
      if (!planned.agent) {
        errors.push(
          `Workflow step "${planned.step.name}" requires ${planned.roleNames.join(" or ") || "an assigned role"}.`
        );
      }
    }

    const hasFileChanges = plan.workflow.steps.some((step) => step.allowsFileChanges);
    if (hasFileChanges) {
      const safety = new SafetyPolicy({
        enableDangerousModes: false,
        dangerousModeSelected: false,
        dangerousModeConfirmed: false
      });
      const check = safety.checkWorkflowFileChanges({
        mode: safetyMode,
        hasCoder: this.options.team.enabledAgents().some((agent) => agent.assignedRoleIds.includes("coder")),
        hasReviewer: this.options.team.enabledAgents().some((agent) => agent.assignedRoleIds.includes("reviewer")),
        hasTester: this.options.team.enabledAgents().some((agent) => agent.assignedRoleIds.includes("tester"))
      });
      if (check.blocked) errors.push(...check.warnings);
      else warnings.push(...check.warnings);
    }

    return { blocked: errors.length > 0, errors, warnings, plan };
  }

  private workflow(workflowId: string): WorkflowDefinition {
    const workflow = this.options.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    return workflow;
  }

  private resolveAgent(step: WorkflowStep): VirtualAgent | undefined {
    if (step.speaker === "conductor") return undefined;
    const candidates = this.options.team.agentsWithAnyRole(step.anyOfRoleIds, {
      providerId: step.preferredProviderId
    });
    if (step.preferredAgentId) {
      const preferred = candidates.find((agent) => agent.id === step.preferredAgentId);
      if (preferred) return preferred;
    }
    return candidates[0];
  }
}
