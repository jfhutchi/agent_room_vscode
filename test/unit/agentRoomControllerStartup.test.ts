import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/core/AgentRoomController.ts", "utf8");

test("controller does not use DEFAULT_OPERATING_MODE as a startup fallback", () => {
  assert.doesNotMatch(source, /DEFAULT_OPERATING_MODE/);
});

test("controller does not create a default profile before mode selection", () => {
  assert.doesNotMatch(
    source,
    /private\s+profile\s*:\s*RoomProfile\s*=\s*createDefaultRoomProfile\(\)/
  );
  assert.doesNotMatch(source, /createDefaultRoomProfile\(\)/);
});

test("controller does not create profile store or provider registry in the constructor", () => {
  assert.doesNotMatch(source, /this\.profileStore\s*=\s*this\.createProfileStore\(\)/);
  assert.doesNotMatch(source, /this\.providerRegistry\s*=\s*this\.createProviderRegistry\(\)/);
});
