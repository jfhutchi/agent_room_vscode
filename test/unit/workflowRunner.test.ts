import assert from "node:assert/strict";
import test from "node:test";
import { RoleRegistry, ROLE_IDS } from "../../src/core/RoleRegistry";
import { VirtualTeamRegistry, defaultVirtualAgents } from "../../src/core/VirtualTeamRegistry";
import { WorkflowRunner } from "../../src/core/WorkflowRunner";
import { WORKFLOW_IDS, WorkflowRegistry } from "../../src/core/WorkflowRegistry";
import { defaultProviders } from "../../src/core/VirtualTeamRegistry";
import type { OperatingMode } from "../../src/core/OperatingMode";

function runner(
  team = new VirtualTeamRegistry(),
  operatingMode: OperatingMode = "personalLocal",
  copilotAgentSessionSupported = false
): WorkflowRunner {
  return new WorkflowRunner({
    team,
    roles: new RoleRegistry(),
    workflows: new WorkflowRegistry(),
    providers: defaultProviders(operatingMode),
    operatingMode,
    copilotAgentSessionSupported
  });
}

test("implementation workflow is blocked when no Coder exists", () => {
  const team = new VirtualTeamRegistry();
  for (const agent of team.all()) {
    team.removeRole(agent.id, ROLE_IDS.coder);
  }

  const validation = runner(team).validateWorkflow(WORKFLOW_IDS.planReviewCode, "workspaceWriteWithApproval");

  assert.equal(validation.blocked, true);
  assert.match(validation.errors.join("\n"), /Coder/i);
});

test("review workflow is blocked when no Reviewer exists", () => {
  const team = new VirtualTeamRegistry();
  for (const agent of team.all()) {
    team.removeRole(agent.id, ROLE_IDS.reviewer);
  }

  const validation = runner(team).validateWorkflow(WORKFLOW_IDS.codeReview, "workspaceWriteWithApproval");

  assert.equal(validation.blocked, true);
  assert.match(validation.errors.join("\n"), /Reviewer/i);
});

test("security workflow is blocked when no Security Auditor exists", () => {
  const team = new VirtualTeamRegistry();
  for (const agent of team.all()) {
    team.removeRole(agent.id, ROLE_IDS.securityAuditor);
  }

  const validation = runner(team).validateWorkflow(WORKFLOW_IDS.securityReview, "readOnly");

  assert.equal(validation.blocked, true);
  assert.match(validation.errors.join("\n"), /Security Auditor/i);
});

test("workflow plan resolves assigned roles without silently picking unassigned agents", () => {
  const plan = runner().planWorkflow(WORKFLOW_IDS.planReview);

  assert.equal(plan.steps[0].agent?.displayName, "Atlas");
  assert.equal(plan.steps[1].agent?.displayName, "Sentinel");
  assert.equal(plan.steps.every((step) => step.step.speaker === "conductor" || step.agent), true);
});

test("Work Mode blocks steps that demand a personal provider with the separation guard", () => {
  // Roundtable hard-requires claudeCodeCli/codexCli-backed speakers (SPEC §10).
  const team = new VirtualTeamRegistry(defaultVirtualAgents("workCopilotNative"));
  const validation = runner(team, "workCopilotNative").validateWorkflow(
    WORKFLOW_IDS.roundtable,
    "workspaceWriteWithApproval"
  );

  assert.equal(validation.blocked, true);
  const text = validation.errors.join("\n");
  assert.match(text, /claudeCodeCli provider.*does not exist in Work Mode/);
  assert.match(text, /codexCli provider.*does not exist in Work Mode/);
  // §6 separation guard, verbatim intent: by design + how to change mode.
  assert.match(text, /This workspace is in Work Mode/);
  assert.match(text, /unavailable here by design/);
  assert.match(text, /Agent Room: Switch Operating Mode/);
});

test("Work Mode blocks an agent backed by a personal provider instead of substituting", () => {
  // Defense in depth: even if a personal-provider agent sneaks into a Work
  // Mode team (profile validation should have refused it), the runner emits
  // the separation guard rather than silently picking another agent.
  const agents = defaultVirtualAgents("workCopilotNative");
  const atlas = agents.find((agent) => agent.id === "atlas");
  assert.ok(atlas);
  atlas.providerId = "claudeCodeCli";

  const validation = runner(new VirtualTeamRegistry(agents), "workCopilotNative").validateWorkflow(
    WORKFLOW_IDS.planningOnly,
    "readOnly"
  );

  assert.equal(validation.blocked, true);
  assert.match(
    validation.errors.join("\n"),
    /Atlas is backed by the claudeCodeCli provider.*does not exist in Work Mode/
  );
  assert.match(validation.errors.join("\n"), /Agent Room: Switch Operating Mode/);
});

test("Personal Mode blocks an agent backed by a Copilot provider instead of substituting", () => {
  const agents = defaultVirtualAgents("personalLocal");
  const forge = agents.find((agent) => agent.id === "forge");
  assert.ok(forge);
  forge.providerId = "copilotNative";

  const validation = runner(new VirtualTeamRegistry(agents), "personalLocal").validateWorkflow(
    WORKFLOW_IDS.codeReview,
    "workspaceWriteWithApproval"
  );

  assert.equal(validation.blocked, true);
  const text = validation.errors.join("\n");
  assert.match(text, /Forge is backed by the copilotNative provider.*does not exist in Personal Mode/);
  assert.match(text, /This workspace is in Personal Mode/);
  assert.match(text, /Agent Room: Switch Operating Mode/);
});

test("direct Copilot Agent Session steps are blocked until capability is confirmed", () => {
  const agents = defaultVirtualAgents("workCopilotNative");
  const atlas = agents.find((agent) => agent.id === "atlas");
  assert.ok(atlas);
  atlas.providerId = "copilotAgentSession";

  const blocked = runner(new VirtualTeamRegistry(agents), "workCopilotNative").validateWorkflow(
    WORKFLOW_IDS.planningOnly,
    "readOnly"
  );
  assert.equal(blocked.blocked, true);
  assert.match(
    blocked.errors.join("\n"),
    /Direct Copilot Agent Session orchestration is not exposed through public APIs/
  );

  const supported = runner(
    new VirtualTeamRegistry(agents),
    "workCopilotNative",
    true
  ).validateWorkflow(WORKFLOW_IDS.planningOnly, "readOnly");
  assert.equal(
    supported.errors.some((error) => /Agent Session orchestration/.test(error)),
    false
  );
});

test("optional research step is skipped with a note when Scout is disabled, never run", () => {
  // Default Personal team ships Scout disabled (SPEC §5); Full Build Cycle's
  // research step is optional, so the workflow proceeds with a warning.
  const validation = runner().validateWorkflow(WORKFLOW_IDS.fullBuildCycle, "workspaceWriteWithApproval");

  assert.equal(validation.blocked, false);
  assert.match(validation.warnings.join("\n"), /Optional step "Research" will be skipped/);
  const researchStep = validation.plan.steps.find((step) => step.step.id === "research");
  assert.equal(researchStep?.agent, undefined);
});

test("Personal Mode default team passes mode validation for built-in workflows", () => {
  const validation = runner().validateWorkflow(WORKFLOW_IDS.planReviewCode, "workspaceWriteWithApproval");

  assert.equal(validation.blocked, false);
  assert.equal(validation.errors.length, 0);
});

test("Copilot sync and mode-setup workflows are conductor-driven and valid in both modes", () => {
  for (const mode of ["personalLocal", "workCopilotNative"] as const) {
    const team = new VirtualTeamRegistry(defaultVirtualAgents(mode));
    for (const id of [WORKFLOW_IDS.copilotCustomAgentSync, WORKFLOW_IDS.modeSetupProviderCheck]) {
      const validation = runner(team, mode).validateWorkflow(id, "readOnly");
      assert.equal(validation.blocked, false);
      assert.equal(
        validation.plan.steps.every((step) => step.step.speaker === "conductor"),
        true
      );
    }
  }
});
