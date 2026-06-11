# 004 Build Claude Code Adapter

Implement `ClaudeCodeProvider.ts` around the local `claude` executable. Use local CLI auth only. Health checks should run version/help probes. Turns should prefer structured output when configured and fall back to plain text.

Failure handling:
- Missing executable: show a friendly setup message.
- Likely auth error: tell the user to run `claude` in a terminal.
- Unsupported flags: expose diagnostics and preserve plain output.
