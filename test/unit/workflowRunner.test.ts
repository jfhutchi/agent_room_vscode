import assert from "node:assert/strict";
import test from "node:test";
import { RoleRegistry, ROLE_IDS } from "../../src/core/RoleRegistry";
import { VirtualTeamRegistry } from "../../src/core/VirtualTeamRegistry";
import { WorkflowRunner } from "../../src/core/WorkflowRunner";
import { WORKFLOW_IDS, WorkflowRegistry } from "../../src/core/WorkflowRegistry";
import { defaultProviders } from "../../src/core/VirtualTeamRegistry";

function runner(team = new VirtualTeamRegistry()): WorkflowRunner {
  return new WorkflowRunner({
    team,
    roles: new RoleRegistry(),
    workflows: new WorkflowRegistry(),
    providers: defaultProviders()
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
