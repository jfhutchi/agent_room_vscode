# Personal Mode (Local CLI)

Personal Mode uses your local CLI logins. There is no GitHub Copilot dependency and no
API keys are required for Claude or Codex.

## What runs in Personal Mode

- **claudeCodeCli** — your local `claude` executable and existing Claude Code login.
  Spawned as a background child process with args arrays (`claude -p`, with
  `--output-format stream-json`/`json` when the CLI supports it; degrades to plain
  text). No visible terminal, no scraping.
- **codexCli** — your local `codex` executable and login. Preferred shape:
  `codex exec --cd <root> --sandbox <mode> --ask-for-approval <policy> --json -`;
  unsupported flags are omitted per detected capabilities. A read-only safety mode
  always forces a read-only sandbox.
- **openAiWebSearch (Scout)** — optional, disabled by default; your own OpenAI API key
  from an environment variable or VS Code secret storage. Cites sources; never scrapes
  chatgpt.com; never automates a browser; never sends code to the web automatically.
- **human** and the internal **Conductor**.

Copilot providers do not exist in Personal Mode — see
[MODE_SEPARATION.md](MODE_SEPARATION.md).

## Health

**Agent Room: Check CLI Health** probes `--version`/`--help` (never your code) and
shows, honestly:

> Claude Code is not available. Run `claude` once in a terminal to finish setup.

> Codex is not available. Run `codex` once in a terminal to finish setup.

plus "authentication likely required" hints, detected capabilities, and Scout
configuration state.

## Shared usage pools

Atlas and Forge share your Claude Code login; Sentinel and Gauge share your Codex
login. Their combined activity draws on the same account quotas.

## What Personal Mode must never do (and doesn't)

Use company Copilot credentials; pretend personal providers are company-approved;
store API keys in transcripts or profiles; log secrets (diagnostics are redacted);
send code to web research automatically; scrape chatgpt.com; automate the ChatGPT UI.
