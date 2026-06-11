# Provider Model

A provider is a backend that can run a turn.

Built-in providers:
- `claudeCodeCli`: local Claude Code CLI, default executable `claude`.
- `codexCli`: local Codex CLI, default executable `codex`.
- `openAiWebSearch`: optional OpenAI web research provider for Scout.
- `human`: the user.
- `internalConductor`: deterministic extension logic.

Provider responsibilities:
- Health check without sending prompts.
- Run a turn with bounded prompt context.
- Return final text, status, diagnostics, warnings, and fallback state.
- Preserve local CLI authentication instead of storing Claude/Codex secrets.
