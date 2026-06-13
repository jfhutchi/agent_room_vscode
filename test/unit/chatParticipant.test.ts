import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_PARTICIPANT_DISABLED_MESSAGE,
  CHAT_PARTICIPANT_ID,
  chatParticipantReply
} from "../../src/core/ChatParticipant";

test("participant id matches the package.json chatParticipants contribution", async () => {
  const { readFileSync } = await import("node:fs");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    contributes: { chatParticipants: Array<{ id: string; name: string }> };
  };
  assert.equal(pkg.contributes.chatParticipants.length, 1);
  assert.equal(pkg.contributes.chatParticipants[0].id, CHAT_PARTICIPANT_ID);
});

test("disabled participant only explains how to enable itself", () => {
  const reply = chatParticipantReply({
    settingEnabled: false,
    prompt: "plan a feature",
    status: { modeTitle: "Agent Room — Work Mode", recommendationText: "use Plan → Review" }
  });

  assert.equal(reply, CHAT_PARTICIPANT_DISABLED_MESSAGE);
  assert.match(reply, /registerChatParticipant/);
  // No state, no recommendation leaks while disabled.
  assert.equal(reply.includes("Work Mode"), false);
  assert.equal(reply.includes("Plan → Review"), false);
});

test("enabled participant explains state and recommends, claiming no Copilot control", () => {
  const reply = chatParticipantReply({
    settingEnabled: true,
    prompt: "implement the parser",
    status: {
      modeTitle: "Agent Room — Work Mode",
      modeDescription: "Using company-approved GitHub Copilot providers.",
      recommendationText: "Recommended workflow: Full Build Cycle."
    }
  });

  assert.match(reply, /Agent Room — Work Mode/);
  assert.match(reply, /Recommended workflow: Full Build Cycle/);
  assert.match(reply, /do not control Copilot internals/);
});

test("enabled participant without a selected mode says so honestly", () => {
  const reply = chatParticipantReply({ settingEnabled: true, prompt: "hi", status: {} });

  assert.match(reply, /No operating mode is selected/);
  assert.match(reply, /Work Mode or Personal Mode/);
});
