# Copilot Integration

Agent Room integrates with GitHub Copilot at three levels. Levels are strictly
capability-gated: a feature exists only where a public VS Code API verifiably supports
it (checked against `node_modules/@types/vscode` 1.91.0 and runtime extension
detection — never from memory). Honest false beats fake true.

## Level 1 — Custom Agent Generation (works today)

**Agent Room: Generate Copilot Custom Agents** writes five files under
`.github/agents/` (directory configurable via
`agentRoom.copilotIntegration.customAgentsDirectory`):

`atlas-planner.agent.md`, `forge-coder.agent.md`, `sentinel-reviewer.agent.md`,
`gauge-tester.agent.md`, `scout-researcher.agent.md`

Each file contains the agent's name, description, role instructions, expected
behavior, safety rules, handoff guidance, expected output format, and its relationship
to the Agent Room virtual team member.

**No-overwrite protection:** line 1 of each generated file is a content-hash marker.
If the body no longer matches the hash — or the marker is missing — the file is
treated as user-owned and is never overwritten without an explicit confirmation
dialog. Preview (untitled editors, writes nothing), write, update-in-place,
skip-modified, and open-folder are all supported. The "Copilot Custom Agent Sync"
workflow runs the same flow from the room.

## Level 2 — `@agent-room` chat participant

Built on the public `vscode.chat.createChatParticipant` API (verified in typings).
Behaviors are gated by `agentRoom.copilotIntegration.registerChatParticipant`
(default **false**); while disabled the participant only explains how to enable it
(see SPEC_DEVIATIONS.md entry 8 for why the handler is always attached).

When enabled it may: explain Agent Room's state, recommend a workflow for your prompt,
and offer buttons to open Agent Room, route the selection to the Planner, or generate
custom agents. It must not — and does not — control Copilot internals, invoke private
Copilot APIs, or read the Copilot conversation.

## Level 3 — Direct Copilot / Agent HQ sessions (not supported)

There is **no public API** for invoking Copilot agent sessions, invoking third-party
Claude/Codex agent sessions, reading their transcripts, or rendering them in a custom
webview (zero matching declarations in @types/vscode 1.91.0). Accordingly:

- The `copilotAgentSession` provider is a permanently disabled scaffold that refuses
  every turn with the canonical limitation string.
- Every agent-session capability flag is hard `false`.

> Direct Copilot Agent Session orchestration is not exposed through public APIs in this
> environment. Agent Room can still generate Copilot custom agents and use approved
> Work Mode features.

No faking, no scraping, no UI automation, no private APIs.

## Capability detection

**Agent Room: Check Copilot Integration Capabilities** (also surfaced in the webview's
Copilot panel) reports extension/chat detection via `vscode.extensions.getExtension`,
typings-backed API availability, and the limitations above — exactly as detected, with
`checkedAt` timestamps.
