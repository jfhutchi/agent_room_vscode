import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { profileFileNameForMode } from "../../src/core/OperatingMode";
import { RoomProfileStore, createDefaultRoomProfile } from "../../src/core/RoomProfileStore";

test("room profile store writes work-profile.json for Work Mode", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-profile-"));
  try {
    const store = new RoomProfileStore({
      mode: "workspace",
      workspaceRoot: workspace,
      operatingMode: "workCopilotNative"
    });

    await store.save(createDefaultRoomProfile("workCopilotNative"));

    const file = path.join(workspace, ".agent-room", "profiles", "work-profile.json");
    const text = await readFile(file, "utf8");
    assert.match(text, /copilotNative/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("room profile store writes personal-profile.json for Personal Mode and never hybrid-profile.json", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-profile-"));
  try {
    const store = new RoomProfileStore({
      mode: "workspace",
      workspaceRoot: workspace,
      operatingMode: "personalLocal"
    });

    await store.save(createDefaultRoomProfile("personalLocal"));

    assert.equal(profileFileNameForMode("personalLocal"), "personal-profile.json");
    const file = path.join(workspace, ".agent-room", "profiles", "personal-profile.json");
    const text = await readFile(file, "utf8");
    assert.match(text, /claudeCodeCli/);

    const hybrid = path.join(workspace, ".agent-room", "profiles", "hybrid-profile.json");
    await assert.rejects(readFile(hybrid, "utf8"), /ENOENT/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loading a Work profile that references personal providers is a validation error", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-profile-"));
  try {
    const profile = createDefaultRoomProfile("personalLocal");
    const dir = path.join(workspace, ".agent-room", "profiles");
    await writeFile(path.join(workspace, ".keep"), "", "utf8").catch(() => undefined);
    await new RoomProfileStore({
      mode: "workspace",
      workspaceRoot: workspace,
      operatingMode: "personalLocal"
    }).save(profile);
    await writeFile(path.join(dir, "work-profile.json"), JSON.stringify(profile, null, 2), "utf8");

    const workStore = new RoomProfileStore({
      mode: "workspace",
      workspaceRoot: workspace,
      operatingMode: "workCopilotNative"
    });

    await assert.rejects(workStore.load(), /not valid in Work Mode/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("loading a Personal profile that references Copilot providers is a validation error", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-room-profile-"));
  try {
    const profile = createDefaultRoomProfile("workCopilotNative");
    const workStore = new RoomProfileStore({
      mode: "workspace",
      workspaceRoot: workspace,
      operatingMode: "workCopilotNative"
    });
    await workStore.save(profile);
    await writeFile(
      path.join(workspace, ".agent-room", "profiles", "personal-profile.json"),
      JSON.stringify(profile, null, 2),
      "utf8"
    );

    const personalStore = new RoomProfileStore({
      mode: "workspace",
      workspaceRoot: workspace,
      operatingMode: "personalLocal"
    });

    await assert.rejects(personalStore.load(), /not valid in Personal Mode/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
