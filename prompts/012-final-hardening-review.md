# 012 Final Hardening Review

Perform a final review of security, UX, docs, tests, and CLI uncertainty.

Checklist:
- Strict CSP and no remote assets.
- No unsafe HTML injection.
- No shell string concatenation for prompts.
- Missing CLIs fail gracefully.
- Scout disabled by default.
- Dangerous modes blocked by default.
- README and docs match implemented behavior.
- `npm run compile`, `npm run lint`, and `npm test` pass or exact failures are documented.
