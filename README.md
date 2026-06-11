# Agent Room

Agent Room is a VS Code extension that opens a shared coding-team room inside VS Code. The room coordinates named virtual team members backed by local Claude Code CLI, local Codex CLI, optional OpenAI Web Research, and an internal Conductor.

## What Agent Room Is

A professional, role-based multi-agent command center for a workspace. It keeps the transcript in a webview, runs provider CLIs as background child processes, hides raw diagnostics by default, and lets the user route work through team roles and workflows.

## What It Is Not

Agent Room is not a terminal screen scraper, a ChatGPT browser automation tool, a direct Anthropic API client, or a hosted proxy. It does not require API keys for local Claude or Codex usage.

## Why Local CLIs

Claude Code and Codex already own authentication, sandboxing, model selection, and local workspace access. Agent Room launches those CLIs with `child_process.spawn`, captures stdout/stderr, parses structured output when available, and renders clean results in the room.

## Prerequisites

- VS Code 1.85 or newer
- Node.js 20 or newer
- `npm install`
- Optional: local `claude` CLI and local `codex` CLI already authenticated
- Optional: a user-owned OpenAI API key for Scout web research

## Authentication Model

Claude Code uses the local `claude` executable and the user's existing Claude Code login. Codex uses the local `codex` executable and the user's existing Codex login. If either CLI is missing or unauthenticated, Agent Room reports that in provider health and tells the user to run the CLI in a terminal to complete setup.

## Installing Dependencies

```bash
npm install
```

## Running in Extension Development Host

```bash
npm run compile
```

Then open the workspace in VS Code and press `F5`, or use the included "Run Agent Room Extension" launch configuration.

## Opening Agent Room

Run `Agent Room: Open` from the Command Palette.

## Default Team Members

- User: Product Owner, Final Approver, provider `human`
- Atlas: Planner, Architect, Explainer, provider `claudeCodeCli`
- Forge: Coder, Documentation Writer, provider `claudeCodeCli`
- Sentinel: Reviewer, Security Auditor, Code Quality Auditor, provider `codexCli`
- Gauge: Tester, DevOps Reviewer, provider `codexCli`
- Scout: Web Researcher, Source Checker, Documentation Finder, Current Info Verifier, provider `openAiWebSearch`, disabled by default
- Conductor: Moderator, Workflow Coordinator, Transcript Summarizer, Safety Gatekeeper, Model Advisor, provider `internalConductor`

## Providers vs Virtual Agents vs Roles

A provider is the backend that runs a turn. A virtual agent is a named teammate that speaks in the transcript. A role is a responsibility assigned to one or more agents.

## Role Assignments

Open Room Setup from the header or run `Agent Room: Open Room Setup`. The role matrix lets you assign and remove roles from any team member.

## Multiple Roles Per Agent

Any team member can hold multiple roles. For example, Atlas can be both Planner and Coder if you explicitly assign both roles.

## Shared Provider Usage Pools

Atlas and Forge share the Claude Code CLI provider and the user's Claude Code usage pool. Sentinel and Gauge share the Codex CLI provider and the user's Codex usage pool. Scout uses a separate optional OpenAI web research configuration.

## Workflows

Built-in workflows include Manual, Planning Only, Plan -> Review, Plan -> Review -> Code, Code -> Review, Security Review, Test Review, Research -> Plan -> Review -> Code, Full Build Cycle, Roundtable, Adversarial Review, Documentation Pass, and Claim Verification.

## Model Advisor

The Conductor classifies the prompt and recommends a workflow, agents, model tiers, context level, and safety mode. It is advisory by default. `agentRoom.modelAdvisor.autoApply` can apply recommendations when no deep-reasoning confirmation is needed.

## Optional Web Research / Scout

Scout is disabled by default. Enable `agentRoom.webResearch.enabled`, configure `agentRoom.webResearch.model`, and provide a user-owned API key through `OPENAI_API_KEY` or VS Code SecretStorage. Agent Room never scrapes chatgpt.com and never automates a browser session for research.

## Context Chips

The composer has chips for current selection, git status, and current file. Git context uses safe read-only commands and excludes full diffs by default.

## Safety Model

Default mode is workspace-write with approval. Read-only mode instructs agents not to modify files. Dangerous mode is downgraded unless explicitly enabled and confirmed. Agent Room never parses agent text and executes commands itself.

## Transcript Storage

Transcripts can be stored in memory, workspace, or global storage. Workspace mode writes under `.agent-room/transcripts/`; transcripts and cache are git-ignored by the generated `.agent-room/.gitignore`.

## Exporting Transcripts

Use the Export MD or Export JSON buttons, or run `Agent Room: Export Transcript`.

## OutputChannel and Diagnostics

Agent Room writes redacted diagnostics to the "Agent Room" output channel according to `agentRoom.logging.level`. Message diagnostics are hidden behind expandable blocks in the transcript.

## Settings

All settings live under `agentRoom.*`, including CLI executable paths, default workflow, context limits, transcript/profile storage, Codex sandbox/approval, model advisor preferences, and Scout configuration.

## Troubleshooting

- Claude command not found: set `agentRoom.claude.executable` or fix PATH inside VS Code.
- Codex command not found: set `agentRoom.codex.executable` or fix PATH inside VS Code.
- Claude installed but not authenticated: run `claude` in a terminal and complete login.
- Codex installed but not authenticated: run `codex` in a terminal and complete login.
- PATH differs inside VS Code: launch VS Code from the terminal that can find the CLI.
- Unsupported CLI flags: providers fall back to plain output parsing where possible and expose diagnostics.
- Workspace not open: workspace storage and git context are unavailable.
- Windows PowerShell path issues: prefer absolute executable paths in settings.
- WSL differences: install and authenticate CLIs in the environment where VS Code Extension Host runs.
- Web Research disabled: enable Scout and configure a user-owned key and model.
- Long-running process stuck: use Stop; Agent Room aborts the active child process.
- No terminal output visible: this is by design; normal runs are background child processes.

## Windows Notes

The child-process runner avoids `shell: true`. On Windows it has a conservative `.cmd` fallback with argument validation and passes prompts via stdin where supported.

## WSL Notes

Remote WSL windows run the extension host inside WSL. Configure `claude`, `codex`, git, and environment variables in WSL, not Windows.

## Known Limitations

CLI flags for Claude Code and Codex can change. Agent Room probes help output, prefers structured output, and falls back to plain stdout/stderr. The UI is a plain webview, not a custom editor. Scout uses the OpenAI Responses API shape and may need adjustment if web-search tool names change.

## Roadmap

- Richer transcript search
- Per-workflow custom prompts
- SecretStorage UI for Scout key entry
- Extension-host integration tests
- VSIX packaging workflow

## Manual Test Checklist

- Open Agent Room
- Run health check
- Send to Atlas, Forge, Sentinel, Gauge
- Run Plan -> Review
- Run Full Build Cycle
- Assign multiple roles to one agent
- Assign the same role to multiple agents
- Create, edit, and delete a custom role
- Export and import a profile
- Enable and disable Scout
- Run a Model Advisor recommendation
- Export transcript
- Clear transcript
- Stop a long-running run
- Verify no integrated terminal spam
- Verify light and dark themes
