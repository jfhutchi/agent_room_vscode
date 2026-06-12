# Agent Room — Codex Instructions

Read these files before making changes:

1. `docs/SPEC.md`
2. `docs/PLAN.md`
3. `PROMPTS.md`
4. `CLAUDE.md`
5. `docs/SPEC_DEVIATIONS.md` if it exists

Authoritative rules:

- `docs/SPEC.md` is the product and engineering source of truth.
- `docs/PLAN.md` is the approved phase plan.
- `CLAUDE.md` contains standing rules that also apply to Codex.
- There is no Hybrid Mode. Agent Room has only:
  - Work / Copilot Native
  - Personal / Local CLI
- Work Mode must never register, expose, invoke, or fall back to personal providers.
- Personal providers include `claudeCodeCli`, `codexCli`, and personal `openAiWebSearch`.
- No private VS Code APIs.
- No Copilot Chat scraping.
- No Copilot UI automation.
- No visible terminals for normal Claude/Codex runs.
- No terminal screen-scraping.
- No `shell: true`.
- No shell-concatenated command strings.
- No secrets, API keys, or environment variables in logs, transcripts, profiles, or webview state.
- Honest false beats fake true for every Copilot capability flag.
- Never delete failing tests to pass.
- Never claim success if compile/test/lint fail.

Required verification gate at the end of every coding session:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
npm install
npm run compile
npm test
npm run lint