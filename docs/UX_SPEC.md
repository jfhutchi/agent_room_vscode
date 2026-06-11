# UX Spec

The room should feel like a first-party VS Code tool: compact, theme-aware, dense enough for daily work, and not like a SaaS dashboard.

Primary surfaces:
- Header: product name, workspace, health and setup commands.
- Status strip: provider health chips, workflow select, safety select.
- Advisor: compact Conductor recommendation.
- Setup panel: collapsible team cards and role matrix.
- Transcript: main working surface, with diagnostics hidden by default.
- Composer: prompt text area, context chips, send/workflow/export/stop actions.

Accessibility:
- Standard controls are used for buttons, checkboxes, selects, and text input.
- Theme colors come from VS Code CSS variables.
- Dynamic text is inserted with DOM text nodes, not HTML injection.
