# 005 Build Codex CLI Adapter

Implement `CodexCliProvider.ts` around the local `codex` executable. Prefer `codex exec`, JSONL output, configured sandbox, and configured approval policy when supported. Pass prompts through stdin where possible.

Safety:
- Never pass bypass/yolo/full-auto flags by default.
- Keep arguments as arrays.
- Capture cancellation and timeouts.
