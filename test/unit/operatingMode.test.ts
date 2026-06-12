import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPERATING_MODE,
  FIRST_LAUNCH_MODE_PICKER_ITEMS,
  OperatingModeManager,
  ROOM_OPEN_MODE_REQUIRED_MESSAGE,
  WORK_TO_PERSONAL_CONFIRMATION_TEXT,
  WORK_TO_PERSONAL_WARNING,
  configuredOperatingModeErrorMessage,
  isOperatingMode,
  parseOperatingMode,
  profileFileNameForMode,
  resolveControllerStartupMode,
  resolveConfiguredOperatingMode
} from "../../src/core/OperatingMode";

class MemoryState {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

test("operating mode defaults to personalLocal and rejects hybrid", () => {
  assert.equal(DEFAULT_OPERATING_MODE, "personalLocal");
  assert.equal(parseOperatingMode(undefined), "personalLocal");
  assert.equal(isOperatingMode("workCopilotNative"), true);
  assert.equal(isOperatingMode("personalLocal"), true);
  assert.equal(isOperatingMode("hybrid"), false);
  assert.throws(() => parseOperatingMode("hybrid"), /Unsupported operating mode/);
});

test("invalid configured mode hybrid does not silently become personalLocal", () => {
  const resolved = resolveConfiguredOperatingMode("hybrid");
  assert.equal(resolved.mode, undefined);
  assert.equal(resolved.invalidValue, "hybrid");
  assert.equal(resolved.requiresExplicitSelection, true);

  const manager = new OperatingModeManager({
    workspaceState: new MemoryState(),
    configuredMode: resolved.mode,
    invalidConfiguredMode: resolved.invalidValue
  });
  assert.equal(manager.currentMode(), undefined);
});

test("controller startup has no active mode before required first-launch selection", () => {
  const manager = new OperatingModeManager({ workspaceState: new MemoryState() });
  assert.equal(resolveControllerStartupMode(manager, true), undefined);
});

test("controller startup uses explicit workspace mode after selection", async () => {
  const manager = new OperatingModeManager({ workspaceState: new MemoryState() });
  await manager.initializeMode("personalLocal");
  assert.equal(resolveControllerStartupMode(manager, true), "personalLocal");
});

test("first-launch picker exposes only Work, Personal, and Learn More with separation text", () => {
  assert.deepEqual(
    FIRST_LAUNCH_MODE_PICKER_ITEMS.map((item) => item.label),
    ["Work / Copilot Native", "Personal / Local CLI", "Learn More"]
  );
  assert.equal(FIRST_LAUNCH_MODE_PICKER_ITEMS.some((item) => item.label.includes("Hybrid")), false);
  assert.match(FIRST_LAUNCH_MODE_PICKER_ITEMS[0].detail ?? "", /fully separated/i);
  assert.match(FIRST_LAUNCH_MODE_PICKER_ITEMS[1].detail ?? "", /Agent Room: Switch Operating Mode/);
});

test("canceling required first-launch picker does not initialize mode", async () => {
  const workspaceState = new MemoryState();
  const manager = new OperatingModeManager({ workspaceState });
  const messages: string[] = [];
  let pickerCalls = 0;

  const result = await manager.ensureModeSelectedForOpen({
    firstLaunchPickerRequired: true,
    pickMode: async () => {
      pickerCalls += 1;
      return undefined;
    },
    showInfoMessage: async (message) => {
      messages.push(message);
    }
  });

  assert.equal(result.canOpen, false);
  assert.equal(pickerCalls, 1);
  assert.equal(manager.firstLaunchComplete(), false);
  assert.equal(workspaceState.get("agentRoom.operatingMode"), undefined);
  assert.deepEqual(messages, [ROOM_OPEN_MODE_REQUIRED_MESSAGE]);
});

test("canceling required first-launch picker does not create transcript", async () => {
  const manager = new OperatingModeManager({ workspaceState: new MemoryState() });
  let transcriptCreations = 0;

  const result = await manager.ensureModeSelectedForOpen({
    firstLaunchPickerRequired: true,
    pickMode: async () => undefined,
    showInfoMessage: async () => undefined
  });
  if (result.canOpen) transcriptCreations += 1;

  assert.equal(result.canOpen, false);
  assert.equal(transcriptCreations, 0);
});

test("invalid configured mode causes explicit mode selection", async () => {
  const workspaceState = new MemoryState();
  const manager = new OperatingModeManager({
    workspaceState,
    invalidConfiguredMode: "hybrid"
  });
  const messages: string[] = [];
  let pickerCalls = 0;

  const result = await manager.ensureModeSelectedForOpen({
    firstLaunchPickerRequired: false,
    pickMode: async () => {
      pickerCalls += 1;
      return "workCopilotNative";
    },
    showInfoMessage: async (message) => {
      messages.push(message);
    }
  });

  assert.equal(result.canOpen, true);
  assert.equal(result.mode, "workCopilotNative");
  assert.equal(manager.currentMode(), "workCopilotNative");
  assert.equal(pickerCalls, 1);
  assert.deepEqual(messages, [configuredOperatingModeErrorMessage("hybrid")]);
});

test("switching mode persists per workspace", async () => {
  const workspaceState = new MemoryState();
  const manager = new OperatingModeManager({ workspaceState });

  await manager.initializeMode("workCopilotNative");

  assert.equal(manager.currentMode(), "workCopilotNative");
  assert.equal(workspaceState.get("agentRoom.operatingMode"), "workCopilotNative");
});

test("Work to Personal switch requires typed confirmation and warning text", async () => {
  const workspaceState = new MemoryState();
  const manager = new OperatingModeManager({ workspaceState });
  await manager.initializeMode("workCopilotNative");

  const cancelled = await manager.switchMode("personalLocal", {
    typedConfirmation: "yes",
    cancelActiveProviderSessions: async () => undefined,
    clearRunningState: async () => undefined,
    startTranscriptSegment: async () => undefined,
    showModeChangedMessage: async () => undefined
  });

  assert.equal(cancelled.changed, false);
  assert.equal(cancelled.warningText, WORK_TO_PERSONAL_WARNING);
  assert.equal(manager.currentMode(), "workCopilotNative");

  const confirmed = await manager.switchMode("personalLocal", {
    typedConfirmation: WORK_TO_PERSONAL_CONFIRMATION_TEXT,
    cancelActiveProviderSessions: async () => undefined,
    clearRunningState: async () => undefined,
    startTranscriptSegment: async () => undefined,
    showModeChangedMessage: async () => undefined
  });

  assert.equal(confirmed.changed, true);
  assert.equal(manager.currentMode(), "personalLocal");
});

test("switching mode cancels running state and starts a new mode-tagged segment", async () => {
  const workspaceState = new MemoryState();
  const manager = new OperatingModeManager({ workspaceState });
  const calls: string[] = [];
  await manager.initializeMode("personalLocal");

  const result = await manager.switchMode("workCopilotNative", {
    cancelActiveProviderSessions: async () => {
      calls.push("cancel");
    },
    clearRunningState: async () => {
      calls.push("clear");
    },
    startTranscriptSegment: async (mode) => {
      calls.push(`segment:${mode}`);
    },
    showModeChangedMessage: async (mode) => {
      calls.push(`message:${mode}`);
    }
  });

  assert.equal(result.changed, true);
  assert.deepEqual(calls, [
    "cancel",
    "clear",
    "segment:workCopilotNative",
    "message:workCopilotNative"
  ]);
});

test("profile file names are per-mode only", () => {
  assert.equal(profileFileNameForMode("workCopilotNative"), "work-profile.json");
  assert.equal(profileFileNameForMode("personalLocal"), "personal-profile.json");
  assert.equal(["work-profile.json", "personal-profile.json"].includes("hybrid-profile.json"), false);
});
