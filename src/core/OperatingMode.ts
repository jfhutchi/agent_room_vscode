import type { ProviderId } from "./Types";

export const OPERATING_MODES = ["workCopilotNative", "personalLocal"] as const;

export type OperatingMode = (typeof OPERATING_MODES)[number];

export const DEFAULT_OPERATING_MODE: OperatingMode = "personalLocal";

export const WORK_TO_PERSONAL_WARNING =
  "Switching to Personal Mode will route this workspace's code to your personal AI accounts. Only do this if this repository is yours. Sending employer code to personal providers may violate your employment agreement.";

export const WORK_TO_PERSONAL_CONFIRMATION_TEXT = "I understand";

export const MODE_STATE_KEY = "agentRoom.operatingMode";
export const MODE_FIRST_LAUNCH_COMPLETE_KEY = "agentRoom.operatingMode.firstLaunchComplete";
export const MODE_EVER_WORK_KEY = "agentRoom.operatingMode.everWorkMode";

const PICKER_DETAIL =
  "Work Mode and Personal Mode are fully separated. Mode can be changed later only through Agent Room: Switch Operating Mode.";

export interface ModePickerItem {
  label: string;
  description?: string;
  detail?: string;
  mode?: OperatingMode;
  learnMore?: boolean;
}

export const FIRST_LAUNCH_MODE_PICKER_ITEMS: readonly ModePickerItem[] = [
  {
    label: "Work / Copilot Native",
    description: "Use company-approved GitHub Copilot capabilities only.",
    detail: PICKER_DETAIL,
    mode: "workCopilotNative"
  },
  {
    label: "Personal / Local CLI",
    description: "Use your local Claude Code and Codex CLI logins.",
    detail: PICKER_DETAIL,
    mode: "personalLocal"
  },
  {
    label: "Learn More",
    description: "Show why the modes are fully separated.",
    detail: PICKER_DETAIL,
    learnMore: true
  }
];

export const SWITCH_MODE_PICKER_ITEMS: readonly ModePickerItem[] = [
  FIRST_LAUNCH_MODE_PICKER_ITEMS[0],
  FIRST_LAUNCH_MODE_PICKER_ITEMS[1]
];

export const PERSONAL_PROVIDER_IDS = new Set<string>([
  "claudeCodeCli",
  "codexCli",
  "openAiWebSearch",
  "human",
  "internalConductor"
]);

export const WORK_PROVIDER_IDS = new Set<string>([
  "copilotNative",
  "copilotCustomAgent",
  "copilotAgentSession",
  "human",
  "internalConductor"
]);

export interface KeyValueState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export interface OperatingModeManagerOptions {
  workspaceState: KeyValueState;
  configuredMode?: unknown;
  requireTypedConfirmationOnSwitch?: boolean;
}

export interface ModeSwitchEffects {
  typedConfirmation?: string;
  cancelActiveProviderSessions(): Promise<void> | void;
  clearRunningState(): Promise<void> | void;
  startTranscriptSegment(mode: OperatingMode): Promise<void> | void;
  showModeChangedMessage(mode: OperatingMode): Promise<void> | void;
}

export interface ModeSwitchResult {
  changed: boolean;
  mode: OperatingMode;
  warningText?: string;
}

export function isOperatingMode(value: unknown): value is OperatingMode {
  return value === "workCopilotNative" || value === "personalLocal";
}

export function parseOperatingMode(value: unknown): OperatingMode {
  if (value === undefined || value === null || value === "") return DEFAULT_OPERATING_MODE;
  if (isOperatingMode(value)) return value;
  throw new Error(`Unsupported operating mode: ${String(value)}`);
}

export function tryParseOperatingMode(value: unknown): OperatingMode {
  try {
    return parseOperatingMode(value);
  } catch {
    return DEFAULT_OPERATING_MODE;
  }
}

export function modeTitle(mode: OperatingMode): string {
  return mode === "workCopilotNative" ? "Agent Room - Work Mode" : "Agent Room - Personal Mode";
}

export function modeDescription(mode: OperatingMode): string {
  return mode === "workCopilotNative"
    ? "Using company-approved GitHub Copilot providers."
    : "Using local Claude Code and Codex CLI providers.";
}

export function modeChangedMessage(mode: OperatingMode): string {
  return `Mode changed to ${mode === "workCopilotNative" ? "Work Mode" : "Personal Mode"}.`;
}

export function profileFileNameForMode(mode: OperatingMode): string {
  return mode === "workCopilotNative" ? "work-profile.json" : "personal-profile.json";
}

export function isProviderValidForMode(providerId: ProviderId, mode: OperatingMode): boolean {
  const valid = mode === "workCopilotNative" ? WORK_PROVIDER_IDS : PERSONAL_PROVIDER_IDS;
  return valid.has(providerId);
}

export function modeName(mode: OperatingMode): string {
  return mode === "workCopilotNative" ? "Work Mode" : "Personal Mode";
}

export class OperatingModeManager {
  private readonly requireTypedConfirmationOnSwitch: boolean;

  constructor(private readonly options: OperatingModeManagerOptions) {
    this.requireTypedConfirmationOnSwitch =
      options.requireTypedConfirmationOnSwitch ?? true;
  }

  currentMode(): OperatingMode {
    const stored = this.options.workspaceState.get<unknown>(MODE_STATE_KEY);
    if (isOperatingMode(stored)) return stored;
    return tryParseOperatingMode(this.options.configuredMode);
  }

  firstLaunchComplete(): boolean {
    return this.options.workspaceState.get<boolean>(MODE_FIRST_LAUNCH_COMPLETE_KEY) === true;
  }

  hasEverBeenInWorkMode(): boolean {
    return (
      this.currentMode() === "workCopilotNative" ||
      this.options.workspaceState.get<boolean>(MODE_EVER_WORK_KEY) === true
    );
  }

  async initializeMode(mode: OperatingMode): Promise<void> {
    await this.persistMode(mode);
    await this.options.workspaceState.update(MODE_FIRST_LAUNCH_COMPLETE_KEY, true);
  }

  async switchMode(targetMode: OperatingMode, effects: ModeSwitchEffects): Promise<ModeSwitchResult> {
    const current = this.currentMode();
    if (targetMode === current) return { changed: false, mode: current };

    const needsConfirmation =
      this.requireTypedConfirmationOnSwitch &&
      current === "workCopilotNative" &&
      targetMode === "personalLocal" &&
      this.hasEverBeenInWorkMode();

    if (needsConfirmation && effects.typedConfirmation !== WORK_TO_PERSONAL_CONFIRMATION_TEXT) {
      return { changed: false, mode: current, warningText: WORK_TO_PERSONAL_WARNING };
    }

    await effects.cancelActiveProviderSessions();
    await effects.clearRunningState();
    await this.persistMode(targetMode);
    await this.options.workspaceState.update(MODE_FIRST_LAUNCH_COMPLETE_KEY, true);
    await effects.startTranscriptSegment(targetMode);
    await effects.showModeChangedMessage(targetMode);
    return { changed: true, mode: targetMode };
  }

  private async persistMode(mode: OperatingMode): Promise<void> {
    await this.options.workspaceState.update(MODE_STATE_KEY, mode);
    if (mode === "workCopilotNative") {
      await this.options.workspaceState.update(MODE_EVER_WORK_KEY, true);
    }
  }
}
