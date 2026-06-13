# Mode Separation Enforcement

The Work/Personal partition is enforced in code, at the lowest layer — not just in the
UI. This file describes the mechanisms, in the order they apply.

## 1. Registry-level partition (the foundation)

`ProviderRegistry` is bound to a single operating mode. Registering a provider whose
`supportedModes` does not include that mode **throws**, so cross-mode providers can
never exist inside a registry. In Work Mode the personal providers (`claudeCodeCli`,
`codexCli`, `openAiWebSearch`) are never even constructed — they are absent as objects,
not merely disabled. The inverse holds for Copilot providers in Personal Mode. Tests
prove absence (`has() === false`, `get() === undefined`, empty `all()`), not a disabled
flag, in both directions, including with the real provider classes.

## 2. Profile validation

`work-profile.json` / `personal-profile.json` may only reference same-mode providers.
Loading or importing a profile naming a cross-mode provider is a validation error.

## 3. SafetyPolicy

`SafetyPolicy.checkProviderForMode` blocks any cross-partition provider as a fallback.
No safety context — not even fully armed dangerous mode — opens this gate.

## 4. WorkflowRunner mode validation

A workflow step that demands a provider from the other side (for example Roundtable's
Claude/Codex-pinned steps in Work Mode) blocks the workflow with the separation guard
message instead of substituting another agent:

> This workspace is in Work Mode. Local Claude Code and Codex providers are unavailable
> here by design. If this is a personal repository, use Agent Room: Switch Operating
> Mode.

(The Personal Mode inverse names GitHub Copilot providers.)

## 5. Model Advisor

The advisor never recommends cross-mode providers. If your request asks for one, the
recommendation carries the separation guard as a warning while the plan stays within
the current mode.

## 6. Guarded switching + transcript identity

Mode changes only through `Agent Room: Switch Operating Mode` (typed confirmation for
Work → Personal). Every transcript message carries its operating mode and provider, so
a transcript can never ambiguously interleave modes; each switch starts a new
mode-tagged segment.

## What never happens

No silent provider substitution. No org-policy bypass. No private APIs. No mixed or
hybrid mode — by design, permanently.
