# Agent Room — Standing Rules (apply to every session)

The authoritative spec is docs/SPEC.md. Read the sections relevant to the current task
before changing related code. Section 0 (Authority & Conflict Resolution) overrides
everything: the repo is reality, the spec is intent; prefer existing architecture unless
demonstrably broken; log every deviation in docs/SPEC_DEVIATIONS.md.

Hard constraints, never violated in any phase:
- No private VS Code APIs. Verify API availability against node_modules/@types/vscode
  and engines.vscode — not from memory.
- No Copilot Chat scraping, no Copilot UI automation, no terminal screen-scraping.
- No visible terminals for normal Claude/Codex runs; spawn with args arrays, never
  shell: true, never shell-concatenated strings.
- Hard mode partition (SPEC §3.4): personal providers (claudeCodeCli, codexCli,
  openAiWebSearch) must be UNREGISTERED — not merely disabled — in Work Mode, and
  Copilot providers unregistered in Personal Mode. There is no mixed/hybrid mode and
  none may be added. No org-policy bypass.
- No secrets/API keys/environment variables in logs, transcripts, profiles, or webview
  state. Redact in diagnostics.
- No dangerous/yolo/bypass flags by default. Human stays Final Approver.
- No remote fonts/CDNs/scripts in the webview. Strict CSP + nonce. No unsafe innerHTML.
- Never delete failing tests to pass. Never claim success if compile/test/lint fail.
  Never claim a file changed unless it actually changed.
- Honest false beats fake true for every Copilot capability flag.

Verification gate — run at the end of every session and report actual output:
  node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
  npm install && npm run compile && npm test && npm run lint

End-of-session report format (no other sections):
  ## Files Changed — exact paths, grouped by purpose
  ## Verification — commands run + real results (pass/fail, counts)
  ## Deviations — anything added to docs/SPEC_DEVIATIONS.md this session
  ## Known Limitations — honest
  ## Next — what the following session should start with
