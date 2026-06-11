import assert from "node:assert/strict";
import test from "node:test";
import { ModelAdvisor } from "../../src/core/ModelAdvisor";
import { RoleRegistry } from "../../src/core/RoleRegistry";
import { VirtualTeamRegistry } from "../../src/core/VirtualTeamRegistry";
import { WorkflowRegistry, WORKFLOW_IDS } from "../../src/core/WorkflowRegistry";

function advisor(team = new VirtualTeamRegistry()): ModelAdvisor {
  return new ModelAdvisor({
    team,
    roles: new RoleRegistry(),
    workflows: new WorkflowRegistry(),
    settings: {
      enabled: true,
      autoApply: false,
      showReasoning: true,
      preferLowerCost: true,
      preferSpeed: false,
      preferQuality: false,
      confirmBeforeDeepReasoning: true
    }
  });
}

test("quick question recommends a simple single-agent route", () => {
  const recommendation = advisor().recommend("What does this file do?");

  assert.equal(recommendation.workflowId, WORKFLOW_IDS.manual);
  assert.equal(recommendation.agentPlan.length, 1);
});

test("full build request recommends full build cycle", () => {
  const recommendation = advisor().recommend("Build the whole VS Code extension with tests");

  assert.equal(recommendation.workflowId, WORKFLOW_IDS.fullBuildCycle);
  assert.ok(recommendation.agentPlan.some((entry) => entry.roleNames.includes("Coder")));
});

test("security request includes Security Auditor", () => {
  const recommendation = advisor().recommend("Security review this provider code");

  assert.ok(recommendation.agentPlan.some((entry) => entry.roleNames.includes("Security Auditor")));
});

test("current docs request warns if Scout is disabled", () => {
  const recommendation = advisor().recommend("Check the latest VS Code webview docs");

  assert.equal(recommendation.useWebResearch, false);
  assert.match(recommendation.warnings.join("\n"), /Scout/i);
});

test("current docs request recommends Scout if enabled", () => {
  const team = new VirtualTeamRegistry();
  team.setEnabled("scout", true);

  const recommendation = advisor(team).recommend("Check the latest VS Code webview docs");

  assert.equal(recommendation.useWebResearch, true);
  assert.ok(recommendation.agentPlan.some((entry) => entry.agentId === "scout"));
});
