# 006 Build Optional Web Research Provider

Implement `OpenAiWebSearchProvider.ts` for Scout. It must be disabled by default and require a user-owned OpenAI API key from environment or VS Code SecretStorage. It must not be used for Claude or Codex local mode.

Output must include cited research text where the API returns it and useful diagnostics when configuration is missing.
