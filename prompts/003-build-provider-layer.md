# 003 Build Provider Layer

Implement the provider abstraction in `ProviderTypes.ts` and `ProviderRegistry.ts`. Providers expose `healthCheck()` and `runTurn()`. Results must include status, final text, diagnostics, duration, fallback state, and warnings.

Do not execute provider output. Do not use visible terminals for normal runs. Capture stdout and stderr programmatically.
