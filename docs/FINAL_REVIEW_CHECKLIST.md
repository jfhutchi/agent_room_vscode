# Final Review Checklist

Functionality:
- Extension activates through all contributed commands.
- Webview renders under strict CSP.
- Provider health works without prompts.
- Claude and Codex providers use background child processes.
- Scout is disabled by default.
- Role assignment supports many-to-many relationships.
- Workflows resolve by role assignment.
- Transcript export works.

Security:
- No shell string command execution for provider prompts.
- No terminal scraping.
- No API keys for local Claude/Codex.
- No raw environment logging.
- Webview messages are validated.

Quality:
- Compile, lint, and tests pass.
- README, docs, prompt packs, and changelog are present.
- Known CLI flag uncertainty is documented.
