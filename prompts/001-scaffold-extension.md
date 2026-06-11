# 001 Scaffold Extension

Create a TypeScript VS Code extension using npm. Add `package.json`, `tsconfig.json`, ESLint config, launch/tasks files, `src/extension.ts`, and command contributions for every `agentRoom.*` command. The extension must activate on command execution and create an "Agent Room" output channel.

Acceptance:
- `npm run compile` succeeds.
- `Agent Room: Open` is registered.
- No runtime dependency is added unless strictly necessary.
