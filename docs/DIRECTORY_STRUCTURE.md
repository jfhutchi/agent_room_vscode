# Directory Structure

```text
package.json
tsconfig.json
eslint.config.js
README.md
CHANGELOG.md
src/
  extension.ts
  commands/
  core/
  utils/
  webview/
media/
  agentRoom.css
  agentRoom.js
docs/
prompts/
test/
  unit/
```

Core code avoids importing `vscode` where practical so it can be unit-tested with Node's test runner.
