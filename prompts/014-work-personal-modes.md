# Prompt 014 — Work / Personal Operating Modes

Implement the two-mode system with the hard partition. There is no mixed mode and none
may be added.

## Scope

1. **Modes and persistence.** `agentRoom.operatingMode`
   (`workCopilotNative` | `personalLocal`, default `personalLocal`), stored per
   workspace, always visible in the webview header with the canonical title and
   description strings. First-launch picker per SPEC §3.6 behind
   `agentRoom.firstLaunch.showModePicker`; an invalid configured value forces explicit
   selection instead of silently defaulting.

2. **Registry-level partition (SPEC §3.4).** `ProviderRegistry` is bound to one mode
   and throws on cross-mode registration. In Work Mode, `claudeCodeCli`, `codexCli`,
   and `openAiWebSearch` are never constructed — absent as objects, not disabled
   flags. Inverse for Copilot providers in Personal Mode. Tests must assert absence
   (`has() === false`, `get() === undefined`, empty `all()`) in both directions, using
   the real provider classes as well as fakes.

3. **Guarded switching.** `Agent Room: Switch Operating Mode` is the only path.
   Work → Personal (in a workspace ever in Work Mode) requires the typed confirmation
   with the canonical employment warning; every switch cancels provider sessions and
   starts a new mode-tagged transcript segment.

4. **No silent substitution.** SafetyPolicy blocks cross-partition fallback under
   every safety context; WorkflowRunner blocks cross-mode steps with the §6 separation
   guard; the Model Advisor warns with the guard instead of suggesting cross-mode
   providers; the per-turn runtime path explains rather than falling back.

5. **Per-mode profiles.** `.agent-room/profiles/work-profile.json` and
   `personal-profile.json`; loading or importing a profile naming a cross-mode
   provider fails validation. Never store secrets in profiles.

6. **Provider identity everywhere.** Every transcript message carries operating mode
   and provider id so transcripts can never ambiguously interleave modes.

## Done means

Gate green; a Work Mode session cannot construct or invoke a personal provider by any
code path (proven by absence assertions); both partition directions tested; the
canonical §3.2/§3.4 strings render verbatim.
