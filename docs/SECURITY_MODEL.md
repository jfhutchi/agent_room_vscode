# Security Model

Agent Room treats webview input, imported profiles, provider output, and CLI diagnostics as untrusted.

Controls:
- Strict Content Security Policy.
- No remote scripts, fonts, or CDNs.
- Webview messages are schema validated.
- Provider CLIs run through `spawn` with argument arrays.
- The extension never parses agent text and executes commands.
- Diagnostics are redacted before display.
- Environment variables are not logged.
- Dangerous flags are blocked unless dangerous mode is explicitly enabled and confirmed.

Scout web research:
- Disabled by default.
- Requires user-owned OpenAI credentials.
- Does not scrape chatgpt.com or automate a browser session.
