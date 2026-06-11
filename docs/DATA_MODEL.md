# Data Model

Important records:
- `RoomProfile`: providers, virtual agents, roles, workflows, default workflow, and extra instructions.
- `Transcript`: workspace metadata, profile snapshot, workflow id, messages, and settings snapshot.
- `AgentRoomMessage`: participant identity, provider id, roles, workflow step, timestamp, content, status, diagnostics, and reactions.
- `ProviderHealth`: availability, configuration, likely authentication, version/help text, capabilities, warnings, and errors.

Workspace storage creates `.agent-room/` lazily and git-ignores transcripts and cache.
