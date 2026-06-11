# Product Spec

Agent Room creates a professional shared coding room inside VS Code. The room combines a human user, named virtual agents, provider-backed execution, a deterministic Conductor, transcripts, profile storage, and workflow routing.

Core outcomes:
- Open the room with `Agent Room: Open`.
- Show provider health, workflow, safety mode, transcript, setup, and composer.
- Let the user route prompts directly to agents or through role-based workflows.
- Preserve the distinction between providers, virtual agents, and roles.
- Store and export transcripts without exposing raw diagnostics by default.

Assumptions:
- Local Claude Code and Codex authentication already exists when those CLIs are available.
- Optional Scout research uses user-owned OpenAI credentials only.
- CLI flag support can vary, so providers must parse structured output when available and fall back to plain text.
