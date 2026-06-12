# Acceptance Tests

Automated:
- `npm run compile`
- `npm test`
- `npm run lint`

Manual:
- Open Extension Development Host.
- Run `Agent Room: Open`.
- Confirm the panel renders with provider health, workflow, setup, transcript, and composer.
- Check CLI health without sending prompts.
- Assign and remove roles in the role matrix.
- Send a prompt to a direct agent.
- Run a workflow.
- Stop a long-running provider turn.
- Export markdown and JSON transcripts.
- Verify diagnostics are hidden until expanded.
- Verify no normal run opens an integrated terminal.
