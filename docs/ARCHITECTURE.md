# Architecture

The extension is split into VS Code glue, core orchestration, provider adapters, storage, and webview assets.

- `src/extension.ts` activates the extension and registers commands.
- `src/core/AgentRoomController.ts` owns runtime state, transcript updates, profile edits, workflow execution, and webview hydration.
- `src/core/*Provider.ts` adapters launch local CLIs or optional OpenAI web research.
- `src/core/*Registry.ts` modules hold provider, role, team, and workflow definitions.
- `src/webview/*` creates a strict-CSP webview.
- `media/*` renders the native-feeling UI with no remote assets.

Data flow:
1. User sends a webview message.
2. Controller validates the message and appends transcript entries.
3. WorkflowRunner resolves steps to assigned role holders.
4. PromptBuilder builds provider prompts with bounded context.
5. ProviderRegistry runs the selected provider.
6. TranscriptStore saves results and the panel rehydrates.
