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
import {
  COPILOT_AGENT_SESSION_LIMITATION,
  isProviderValidForMode,
  modeName,
  separationGuardMessage,
  type OperatingMode
} from "./OperatingMode";

export interface WorkflowRunnerOptions {
  team: VirtualTeamRegistry;
  roles: RoleRegistry;
  workflows: WorkflowRegistry;
  providers: ProviderProfile[];
  operatingMode: OperatingMode;
  /**
   * Direct Copilot Agent Session orchestration is capability-gated (SPEC §7
   * Level 3). Stays false until public APIs verifiably support it.
   */
  copilotAgentSessionSupported?: boolean;
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
    const mode = this.options.operatingMode;

    for (const planned of plan.steps) {
      if (planned.step.speaker === "conductor") continue;

      // Mode validation (SPEC §3.4, §10): a step that demands a provider from
      // the other side of the Work/Personal partition gets the separation
      // guard, never a silent substitution.
      const preferredProviderId = planned.step.preferredProviderId;
      if (preferredProviderId && !isProviderValidForMode(preferredProviderId, mode)) {
        errors.push(
          `Workflow step "${planned.step.name}" requires the ${preferredProviderId} provider, ` +
            `which does not exist in ${modeName(mode)}. ${separationGuardMessage(mode)}`
        );
        continue;
      }
      if (planned.agent && !isProviderValidForMode(planned.agent.providerId, mode)) {
        errors.push(
          `${planned.agent.displayName} is backed by the ${planned.agent.providerId} provider, ` +
            `which does not exist in ${modeName(mode)}. ${separationGuardMessage(mode)}`
        );
        continue;
      }

      // Direct Copilot session orchestration stays blocked until public APIs
      // verifiably support it (SPEC §7 Level 3, §10).
      const wantsAgentSession =
        preferredProviderId === "copilotAgentSession" ||
        planned.agent?.providerId === "copilotAgentSession";
      if (wantsAgentSession && !this.options.copilotAgentSessionSupported) {
        errors.push(
          `Workflow step "${planned.step.name}" requires direct Copilot Agent Session ` +
            `orchestration. ${COPILOT_AGENT_SESSION_LIMITATION}`
        );
        continue;
      }

      if (!planned.agent) {
        const requirement = planned.roleNames.join(" or ") || "an assigned role";
        if (planned.step.optional) {
          warnings.push(
            `Optional step "${planned.step.name}" will be skipped: no enabled team member holds ${requirement}.`
          );
        } else {
          errors.push(`Workflow step "${planned.step.name}" requires ${requirement}.`);
        }
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
