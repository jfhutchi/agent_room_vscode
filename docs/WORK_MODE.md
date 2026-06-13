# Work Mode (Copilot Native)

Work Mode uses **only** company-approved GitHub Copilot capabilities through official
public VS Code APIs: the Copilot sign-in your company manages, the chat models your
organization exposes, and workspace files Agent Room generates for Copilot.

## What runs in Work Mode

- **copilotNative** — turns run through `vscode.lm.selectChatModels` against the chat
  models your org exposes (typically via GitHub Copilot Chat). If no models are
  exposed, health and turns say so honestly; nothing is faked.
- **copilotCustomAgent** — represents the generated `.github/agents/*.agent.md` files.
  Invoke those agents inside Copilot Chat; Agent Room maintains the files but cannot
  run a Copilot agent session directly.
- **copilotAgentSession** — a permanently disabled scaffold. Direct Copilot Agent
  Session orchestration is not exposed through public APIs in this environment.
- **human** and the internal **Conductor**.

The personal providers (claudeCodeCli, codexCli, openAiWebSearch) **do not exist** in
Work Mode — see [MODE_SEPARATION.md](MODE_SEPARATION.md).

## What Work Mode must never do (and doesn't)

Ask for personal Anthropic/OpenAI keys or Claude.ai/ChatGPT logins; silently use
personal CLIs or web research; bypass org policy; scrape Copilot Chat; automate the
Copilot UI; use private APIs; send company code to personal providers; pretend
unsupported Copilot orchestration works.

## Detection and display

**Agent Room: Check Copilot Integration Capabilities** reports, honestly: Copilot
extension detected; Copilot Chat detected; custom agent generation possible; chat
participant API available; and a hard "no" for every direct agent-session capability,
with the canonical limitation strings:

> This model or agent is not available under your organization's GitHub Copilot policy.

> Direct Copilot Agent Session orchestration is not exposed through public APIs in this
> environment. Agent Room can still generate Copilot custom agents and use approved
> Work Mode features.

## Models

Map tiers to company-exposed model names via `agentRoom.models.work.*`. Empty = the
first model Copilot exposes. A requested model your org does not expose is refused with
the policy string — never silently substituted.
