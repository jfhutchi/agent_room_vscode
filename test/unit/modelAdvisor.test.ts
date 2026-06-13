import assert from "node:assert/strict";
import test from "node:test";
import { ModelAdvisor } from "../../src/core/ModelAdvisor";
import { RoleRegistry } from "../../src/core/RoleRegistry";
import { VirtualTeamRegistry, defaultVirtualAgents } from "../../src/core/VirtualTeamRegistry";
import { WorkflowRegistry, WORKFLOW_IDS } from "../../src/core/WorkflowRegistry";
import type { OperatingMode } from "../../src/core/OperatingMode";

function advisor(
  team = new VirtualTeamRegistry(),
  operatingMode: OperatingMode = "personalLocal"
): ModelAdvisor {
  return new ModelAdvisor({
    team,
    roles: new RoleRegistry(),
    workflows: new WorkflowRegistry(),
    operatingMode,
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

function workAdvisor(): ModelAdvisor {
  return advisor(new VirtualTeamRegistry(defaultVirtualAgents("workCopilotNative")), "workCopilotNative");
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

test("Copilot custom agent requests route to the sync workflow", () => {
  const recommendation = workAdvisor().recommend("Generate the Copilot custom agent files for my team");

  assert.equal(recommendation.category, "copilotCustomAgentGeneration");
  assert.equal(recommendation.workflowId, WORKFLOW_IDS.copilotCustomAgentSync);
});

test("Copilot capability and mode questions route to the mode setup check", () => {
  const capability = workAdvisor().recommend("Is Copilot agent session integration available here?");
  assert.equal(capability.category, "copilotIntegrationCheck");
  assert.equal(capability.workflowId, WORKFLOW_IDS.modeSetupProviderCheck);

  const mode = advisor().recommend("Should this workspace use Work Mode or Personal Mode?");
  assert.equal(mode.category, "operatingModeSelection");
  assert.equal(mode.workflowId, WORKFLOW_IDS.modeSetupProviderCheck);
});

test("recommendations carry operating mode, effort levels, and §6 mode phrasing", () => {
  const work = workAdvisor().recommend("Build the importer feature with tests");
  assert.equal(work.operatingMode, "workCopilotNative");
  assert.match(work.reasoning, /work repository/);
  assert.match(work.reasoning, /company-approved Copilot models/);
  assert.ok(work.agentPlan.every((entry) => ["low", "medium", "high", "max"].includes(entry.effortLevel)));

  const personal = advisor().recommend("Build the importer feature with tests");
  assert.equal(personal.operatingMode, "personalLocal");
  assert.match(personal.reasoning, /personal/);
  assert.match(personal.reasoning, /local Claude Code and Codex CLI/);
});

test("Work Mode advisor emits the §6 separation guard instead of suggesting local CLIs", () => {
  const recommendation = workAdvisor().recommend("Plan this with the local Claude Code CLI please");

  assert.match(recommendation.warnings.join("\n"), /This workspace is in Work Mode/);
  assert.match(recommendation.warnings.join("\n"), /Agent Room: Switch Operating Mode/);
  // The plan itself never names a cross-partition provider.
  assert.equal(
    recommendation.agentPlan.some((entry) => ["claudeCodeCli", "codexCli"].includes(entry.providerId)),
    false
  );
});

test("Personal Mode advisor emits the separation guard for Copilot requests", () => {
  const recommendation = advisor().recommend("Check what Copilot integration is available");

  assert.match(recommendation.warnings.join("\n"), /This workspace is in Personal Mode/);
  assert.equal(
    recommendation.agentPlan.some((entry) => entry.providerId.startsWith("copilot")),
    false
  );
});

test("high default effort requires confirmation when the setting demands it", () => {
  const recommendation = advisor().recommend("Plan the new sync architecture");

  assert.equal(recommendation.requiresConfirmation, true);
  assert.ok(recommendation.agentPlan.some((entry) => entry.effortLevel === "high"));
});
