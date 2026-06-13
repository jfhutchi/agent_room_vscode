# Prompt 013 — Copilot Integration (Levels 1–3)

Implement Agent Room's Copilot integration honestly and capability-gated.

## Scope

1. **Custom agent generation (Level 1, implement fully).**
   `src/core/CopilotCustomAgentGenerator.ts` produces the five
   `.github/agents/*.agent.md` files (directory from
   `agentRoom.copilotIntegration.customAgentsDirectory`) with every SPEC §7 section.
   Generated files carry a content-hash marker; a file whose body diverges from its
   marker — or has no marker — is user-owned and must never be overwritten without
   explicit confirmation. Support preview, write, update, skip-modified, open folder,
   plus the "Copilot Custom Agent Sync" workflow.

2. **Capability detection.** `src/core/CopilotIntegration.ts` implements
   `CopilotIntegrationCapabilities` exactly per SPEC §7. Extension detection via
   `vscode.extensions.getExtension("GitHub.copilot" / "GitHub.copilot-chat")`. Every
   agent-session flag is hard false unless the public API is verified in
   `node_modules/@types/vscode` against `engines.vscode` — quote the declaration in a
   code comment wherever a flag can be true. `limitations[]` uses the canonical §3.2
   strings. Surface the report via the `checkCopilotCapabilities` command and the
   webview Copilot panel.

3. **copilotNative provider (Work Mode).** Backed by the public
   `vscode.lm.selectChatModels` / `sendRequest` APIs only. Honest "no models exposed"
   health when the list is empty; refuse unavailable requested models with the
   canonical org-policy string; never substitute silently.

4. **Chat participant (Level 2).** Only because `chat.createChatParticipant` exists in
   the installed typings. Behaviors behind
   `agentRoom.copilotIntegration.registerChatParticipant` (default false); §7 Level 2
   behaviors only; never read the Copilot transcript or touch internals.

5. **Level 3 stays a disabled scaffold.** `copilotAgentSession` refuses every turn
   with the canonical limitation. No fake implementation, no scraping, no UI
   automation, no private APIs.

## Done means

Gate green; capability flags provably match the installed typings; generation
round-trips safely with modified-file protection tested in both directions; no
scraping/private-API code path exists anywhere.
