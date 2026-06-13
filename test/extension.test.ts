import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMAND_IDS } from "../src/commands/commandIds";

test("extension command list includes all required commands", () => {
  assert.equal(COMMAND_IDS.includes("agentRoom.open"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.checkCliHealth"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.switchOperatingMode"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.runFullBuildCycleOnCurrentFile"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.openSettings"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.generateCopilotCustomAgents"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.previewCopilotCustomAgents"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.openCopilotCustomAgentsFolder"), true);
  assert.equal(COMMAND_IDS.includes("agentRoom.checkCopilotCapabilities"), true);
});

test("package.json commands and registered command ids stay in sync (SPEC §16)", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { commands: Array<{ command: string }> };
  };
  const contributed = pkg.contributes.commands.map((entry) => entry.command).sort();
  assert.deepEqual(contributed, [...COMMAND_IDS].sort());
});

test("package contributes only the two supported operating modes", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { configuration: { properties: Record<string, { enum?: string[]; default?: string }> } };
  };
  const setting = pkg.contributes.configuration.properties["agentRoom.operatingMode"];
  assert.deepEqual(setting.enum, ["workCopilotNative", "personalLocal"]);
  assert.equal(setting.default, "personalLocal");
  assert.equal(setting.enum?.includes("hybrid"), false);
});
