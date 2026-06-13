# Operating Modes

Agent Room has exactly two operating modes, stored **per workspace** and always visible
in the webview header:

| Mode | Setting value | Header | Providers |
|---|---|---|---|
| Work / Copilot Native | `workCopilotNative` | *Agent Room — Work Mode · Using company-approved GitHub Copilot providers.* | copilotNative, copilotCustomAgent, (copilotAgentSession — disabled scaffold), human, internal Conductor |
| Personal / Local CLI | `personalLocal` | *Agent Room — Personal Mode · Using local Claude Code and Codex CLI providers.* | claudeCodeCli, codexCli, openAiWebSearch (off by default), human, internal Conductor |

There is no third mode and none can be added — see [MODE_SEPARATION.md](MODE_SEPARATION.md).

## Choosing a mode

On first launch per workspace, a VS Code-native picker offers:

1. **Work / Copilot Native** — company-approved GitHub Copilot capabilities only. Best
   for enterprise repositories.
2. **Personal / Local CLI** — your local Claude Code and Codex CLI logins. Best for
   personal projects.

The picker states that the modes are fully separated. The choice is stored per
workspace and never asked again unless you run **Agent Room: Switch Operating Mode**.

## Switching modes

`Agent Room: Switch Operating Mode` is the only way to change mode. Switching
Work → Personal in a workspace that has ever been in Work Mode requires typing
"I understand" after this warning:

> Switching to Personal Mode will route this workspace's code to your personal AI
> accounts. Only do this if this repository is yours. Sending employer code to personal
> providers may violate your employment agreement.

Every switch cancels active provider sessions and starts a new transcript segment
tagged with the new mode.

## Per-mode profiles

Profiles live under `.agent-room/profiles/` as `work-profile.json` and
`personal-profile.json`. A profile may only reference providers valid for its mode;
loading or importing a profile that names a cross-mode provider fails validation —
nothing is silently remapped. Profiles never contain secrets.

## Settings

- `agentRoom.operatingMode` (`workCopilotNative` | `personalLocal`, default
  `personalLocal`) — a hand-edited invalid value forces explicit selection rather than
  silently defaulting.
- `agentRoom.firstLaunch.showModePicker` (default true)
- `agentRoom.workMode.enabled` / `agentRoom.personalMode.enabled` — hide a mode from
  the pickers; disabling both falls back to offering both.
- `agentRoom.modeSeparation.requireTypedConfirmationOnSwitch` (default true)

Related: [WORK_MODE.md](WORK_MODE.md) · [PERSONAL_MODE.md](PERSONAL_MODE.md)
