(function () {
  const vscode = acquireVsCodeApi();
  const state = {
    profile: null,
    transcript: null,
    settings: null,
    operatingMode: "personalLocal",
    operatingModeTitle: "Agent Room — Personal Mode",
    operatingModeDescription: "Using local Claude Code and Codex CLI providers.",
    health: {},
    selectedWorkflowId: "manual",
    safetyMode: "workspaceWriteWithApproval",
    contextChips: { selection: true, currentFile: false, gitStatus: true },
    setupOpen: false,
    latestRecommendation: null,
    copilotCapabilities: null,
    showDiagnostics: false,
    replyTo: null
  };

  const el = {
    workspaceName: document.getElementById("workspaceName"),
    modeTitle: document.getElementById("modeTitle"),
    modeDescription: document.getElementById("modeDescription"),
    health: document.getElementById("providerHealth"),
    workflow: document.getElementById("workflowSelect"),
    safety: document.getElementById("safetySelect"),
    advisor: document.getElementById("advisor"),
    setup: document.getElementById("setupPanel"),
    setupButton: document.getElementById("setupButton"),
    team: document.getElementById("teamList"),
    matrix: document.getElementById("roleMatrix"),
    transcript: document.getElementById("transcript"),
    text: document.getElementById("composerText"),
    chipSelection: document.getElementById("chipSelection"),
    chipCurrentFile: document.getElementById("chipCurrentFile"),
    chipGitStatus: document.getElementById("chipGitStatus"),
    copilotPanel: document.getElementById("copilotPanel"),
    copilotCapabilities: document.getElementById("copilotCapabilities"),
    copilotLimitations: document.getElementById("copilotLimitations"),
    copilotCheckButton: document.getElementById("copilotCheckButton"),
    gitBranch: document.getElementById("gitBranch"),
    typingIndicator: document.getElementById("typingIndicator"),
    diagnosticsButton: document.getElementById("diagnosticsButton"),
    replyChip: document.getElementById("replyChip"),
    replyChipText: document.getElementById("replyChipText"),
    replyChipCancel: document.getElementById("replyChipCancel")
  };

  function post(message) {
    vscode.postMessage(message);
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function roleNames(agent) {
    const ids = new Set(agent.assignedRoleIds || []);
    return (state.profile.roles || []).filter((role) => ids.has(role.id)).map((role) => role.name);
  }

  function providerName(id) {
    return (state.profile.providers || []).find((provider) => provider.id === id)?.displayName || id;
  }

  function healthState(health, provider) {
    if (!provider.enabled) return "disabled";
    if (!health || !health.available) return "missing";
    if (!health.configured) return "needsConfig";
    if (!health.authenticatedLikely) return "needsAuth";
    return "ready";
  }

  function renderHealth() {
    if (!state.profile) return;
    el.health.textContent = "";
    for (const provider of state.profile.providers) {
      // The human (you) and the internal Conductor are always-present
      // participants, not health-checkable backends — the provider registry
      // never probes them, so they have no health entry. Skip them instead of
      // rendering a misleading "missing" chip.
      if (provider.kind === "human" || provider.kind === "internal") continue;
      const health = state.health[provider.id];
      const chip = document.createElement("div");
      const status = healthState(health, provider);
      chip.className = `health-chip ${status}`;
      chip.textContent = `${provider.displayName}: ${status}`;
      if (health?.warnings?.length) chip.title = health.warnings.join("\n");
      el.health.appendChild(chip);
    }
  }

  function renderMode() {
    el.modeTitle.textContent = text(state.operatingModeTitle);
    el.modeDescription.textContent = text(state.operatingModeDescription);
    // The Copilot panel lives in Work Mode; a capabilities report opens it anywhere.
    if (state.operatingMode === "workCopilotNative" || state.copilotCapabilities) {
      el.copilotPanel.classList.remove("hidden");
    } else {
      el.copilotPanel.classList.add("hidden");
    }
  }

  function renderCopilotCapabilities() {
    const capabilities = state.copilotCapabilities;
    el.copilotCapabilities.textContent = "";
    el.copilotLimitations.textContent = "";
    if (!capabilities) return;
    const flags = [
      ["Copilot extension", capabilities.copilotExtensionDetected],
      ["Copilot Chat", capabilities.copilotChatDetected],
      ["Custom agent generation", capabilities.canCreateCustomAgents],
      ["Chat participant API", capabilities.canRegisterChatParticipant],
      ["Direct agent sessions", capabilities.canInvokeCopilotAgentSession],
      ["Third-party agent sessions", capabilities.canInvokeThirdPartyAgentSession],
      ["Read session transcripts", capabilities.canReadAgentSessionTranscript],
      ["Render sessions in webview", capabilities.canRenderAgentSessionInCustomWebview],
      ["Manage Copilot CLI sessions", capabilities.canManageCopilotCliSessions]
    ];
    for (const [label, value] of flags) {
      const chip = document.createElement("div");
      chip.className = `health-chip ${value ? "ready" : "missing"}`;
      chip.textContent = `${label}: ${value ? "yes" : "no"}`;
      el.copilotCapabilities.appendChild(chip);
    }
    for (const limitation of capabilities.limitations || []) {
      const item = document.createElement("li");
      item.textContent = limitation;
      el.copilotLimitations.appendChild(item);
    }
  }

  function renderWorkflows() {
    if (!state.profile) return;
    el.workflow.textContent = "";
    for (const workflow of state.profile.workflows || []) {
      const option = document.createElement("option");
      option.value = workflow.id;
      option.textContent = workflow.name;
      option.selected = workflow.id === state.selectedWorkflowId;
      el.workflow.appendChild(option);
    }
    el.safety.value = state.safetyMode;
  }

  function renderTeam() {
    if (!state.profile) return;
    el.team.textContent = "";
    for (const agent of state.profile.virtualAgents || []) {
      const card = document.createElement("article");
      card.className = "team-card";
      const title = document.createElement("div");
      title.className = "team-name";
      const titleName = document.createElement("span");
      titleName.textContent = text(agent.displayName);
      const titleState = document.createElement("span");
      titleState.textContent = agent.enabled ? "on" : "off";
      title.append(titleName, titleState);
      const provider = document.createElement("div");
      provider.className = "team-provider";
      provider.textContent = providerName(agent.providerId);
      const desc = document.createElement("div");
      desc.className = "team-description";
      desc.textContent = text(agent.description);
      const badges = document.createElement("div");
      badges.className = "role-badges";
      for (const role of roleNames(agent)) {
        const badge = document.createElement("span");
        badge.className = "role-badge";
        badge.textContent = role;
        badges.appendChild(badge);
      }
      card.append(title, provider, desc, badges);
      el.team.appendChild(card);
    }
  }

  function renderRoleMatrix() {
    if (!state.profile) return;
    el.matrix.textContent = "";
    const agents = state.profile.virtualAgents || [];
    const header = document.createElement("div");
    header.className = "role-row header";
    header.appendChild(cell("Role"));
    for (const agent of agents) header.appendChild(cell(agent.displayName));
    el.matrix.appendChild(header);

    for (const role of state.profile.roles || []) {
      const row = document.createElement("div");
      row.className = "role-row";
      const roleCell = document.createElement("div");
      const roleName = document.createElement("strong");
      roleName.textContent = text(role.name);
      const roleDescription = document.createElement("div");
      roleDescription.className = "role-description";
      roleDescription.textContent = text(role.description);
      roleCell.append(roleName, roleDescription);
      row.appendChild(roleCell);
      for (const agent of agents) {
        const label = document.createElement("label");
        label.className = "role-cell";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = (agent.assignedRoleIds || []).includes(role.id);
        input.addEventListener("change", () =>
          post({ type: "updateRoleAssignment", agentId: agent.id, roleId: role.id, assigned: input.checked })
        );
        label.appendChild(input);
        row.appendChild(label);
      }
      el.matrix.appendChild(row);
    }
  }

  function cell(content) {
    const div = document.createElement("div");
    div.textContent = content;
    return div;
  }

  function renderTranscript() {
    el.transcript.textContent = "";
    const messages = state.transcript?.messages || [];
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No transcript yet. Send a prompt or run a workflow.";
      el.transcript.appendChild(empty);
      return;
    }
    for (const message of messages) {
      const article = document.createElement("article");
      article.className = `message ${message.status === "error" ? "error" : ""}`;
      const meta = document.createElement("div");
      const name = document.createElement("div");
      name.className = "message-name";
      name.textContent = text(message.displayName);
      const badges = document.createElement("div");
      badges.className = "message-meta";
      const badgeParts = [];
      if (message.providerId && message.providerId !== "human") {
        badgeParts.push(providerName(message.providerId));
      }
      if ((message.roleNames || []).length) badgeParts.push(message.roleNames.join(", "));
      badges.textContent = badgeParts.join(" · ");
      const status = document.createElement("div");
      status.className = "message-meta";
      const stamp = message.createdAt ? new Date(message.createdAt) : null;
      const time = stamp && !Number.isNaN(stamp.getTime()) ? stamp.toLocaleTimeString() : "";
      status.textContent = [text(message.status), time].filter(Boolean).join(" · ");
      meta.append(name, badges, status);
      const body = document.createElement("div");
      const content = document.createElement("div");
      content.className = "message-content";
      content.textContent = message.content || (message.status === "running" ? "Running..." : "");
      body.appendChild(content);
      if (message.diagnostics && state.showDiagnostics) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Diagnostics";
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(message.diagnostics, null, 2);
        details.append(summary, pre);
        body.appendChild(details);
      }
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => {
        navigator.clipboard?.writeText(message.content || "");
      });
      const reply = document.createElement("button");
      reply.type = "button";
      reply.textContent = "Reply";
      reply.addEventListener("click", () => {
        state.replyTo = { id: message.id, name: message.displayName };
        renderReplyChip();
        el.text.focus();
      });
      actions.append(copy, reply);
      body.appendChild(actions);
      article.append(meta, body);
      el.transcript.appendChild(article);
    }
    el.transcript.scrollTop = el.transcript.scrollHeight;
  }

  function renderReplyChip() {
    if (state.replyTo) {
      el.replyChipText.textContent = `Replying to ${state.replyTo.name}`;
      el.replyChip.classList.remove("hidden");
    } else {
      el.replyChipText.textContent = "";
      el.replyChip.classList.add("hidden");
    }
  }

  function renderAdvisor(recommendation) {
    state.latestRecommendation = recommendation;
    if (!recommendation) {
      el.advisor.classList.add("hidden");
      return;
    }
    el.advisor.classList.remove("hidden");
    el.advisor.textContent = "";
    const title = document.createElement("div");
    title.className = "advisor-title";
    title.textContent = `Conductor recommends ${recommendation.workflowName}`;
    const body = document.createElement("div");
    body.textContent = recommendation.reasoning;
    const actions = document.createElement("div");
    actions.className = "advisor-actions";
    const use = document.createElement("button");
    use.textContent = recommendation.requiresConfirmation
      ? "Confirm and use recommendation"
      : "Use recommendation";
    use.addEventListener("click", () => {
      post({ type: "applyModelAdvisorRecommendation", recommendationId: recommendation.id });
      el.advisor.classList.add("hidden");
    });
    const ignore = document.createElement("button");
    ignore.className = "secondary";
    ignore.textContent = "Ignore";
    ignore.addEventListener("click", () => {
      post({ type: "ignoreModelAdvisorRecommendation", recommendationId: recommendation.id });
      el.advisor.classList.add("hidden");
    });
    actions.append(use, ignore);
    el.advisor.append(title, body, actions);
  }

  function renderAll() {
    if (state.transcript?.workspaceName) el.workspaceName.textContent = state.transcript.workspaceName;
    el.gitBranch.textContent = state.transcript?.gitBranch ? `⎇ ${state.transcript.gitBranch}` : "";
    renderMode();
    renderHealth();
    renderWorkflows();
    renderTeam();
    renderRoleMatrix();
    renderTranscript();
    renderCopilotCapabilities();
    renderReplyChip();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "hydrate") {
      Object.assign(state, {
        profile: message.profile,
        transcript: message.transcript,
        settings: message.settings,
        operatingMode: message.operatingMode || "personalLocal",
        operatingModeTitle: message.operatingModeTitle || "Agent Room — Personal Mode",
        operatingModeDescription:
          message.operatingModeDescription || "Using local Claude Code and Codex CLI providers.",
        health: message.health || {},
        selectedWorkflowId: message.selectedWorkflowId || "manual",
        safetyMode: message.safetyMode || "workspaceWriteWithApproval",
        contextChips: message.contextChips || state.contextChips
      });
      el.chipSelection.checked = Boolean(state.contextChips.selection);
      el.chipCurrentFile.checked = Boolean(state.contextChips.currentFile);
      el.chipGitStatus.checked = Boolean(state.contextChips.gitStatus);
      renderAll();
    }
    if (message.type === "healthUpdated") {
      state.health = message.health || {};
      renderHealth();
    }
    if (message.type === "runningStateChanged") {
      if (message.running && message.activity) {
        el.typingIndicator.textContent = message.activity;
        el.typingIndicator.classList.remove("hidden");
      } else {
        el.typingIndicator.textContent = "";
        el.typingIndicator.classList.add("hidden");
      }
    }
    if (message.type === "copilotCapabilitiesUpdated") {
      state.copilotCapabilities = message.capabilities || null;
      el.copilotPanel.classList.remove("hidden");
      renderCopilotCapabilities();
    }
    if (message.type === "modelAdvisorRecommendation") {
      renderAdvisor(message.recommendation);
    }
    if (message.type === "error") {
      renderAdvisor({ workflowName: "Error", reasoning: message.message, workflowId: "manual", warnings: [] });
    }
    if (message.type === "settingsUpdated" && message.openSetup) {
      state.setupOpen = true;
      el.setup.classList.remove("hidden");
      el.setupButton.setAttribute("aria-expanded", "true");
    }
  });

  document.getElementById("healthButton").addEventListener("click", () => post({ type: "checkHealth" }));
  el.copilotCheckButton.addEventListener("click", () => post({ type: "checkCopilotCapabilities" }));
  el.setupButton.addEventListener("click", () => {
    state.setupOpen = !state.setupOpen;
    el.setup.classList.toggle("hidden", !state.setupOpen);
    el.setupButton.setAttribute("aria-expanded", String(state.setupOpen));
  });
  el.workflow.addEventListener("change", () =>
    post({ type: "updateUiState", state: { selectedWorkflowId: el.workflow.value } })
  );
  el.safety.addEventListener("change", () =>
    post({ type: "updateUiState", state: { safetyMode: el.safety.value } })
  );
  el.diagnosticsButton.addEventListener("click", () => {
    state.showDiagnostics = !state.showDiagnostics;
    el.diagnosticsButton.setAttribute("aria-pressed", String(state.showDiagnostics));
    renderTranscript();
  });
  el.replyChipCancel.addEventListener("click", () => {
    state.replyTo = null;
    renderReplyChip();
  });
  document.getElementById("sendButton").addEventListener("click", () => {
    if (!el.text.value.trim()) return;
    const payload = { type: "sendMessage", text: el.text.value };
    if (state.replyTo) payload.replyToMessageId = state.replyTo.id;
    post(payload);
    state.replyTo = null;
    renderReplyChip();
  });
  document.getElementById("runWorkflowButton").addEventListener("click", () => {
    if (el.text.value.trim()) post({ type: "runWorkflow", workflowId: el.workflow.value, text: el.text.value });
  });
  document.getElementById("stopButton").addEventListener("click", () => post({ type: "stop" }));
  document.getElementById("clearButton").addEventListener("click", () => post({ type: "clearTranscript" }));
  document.getElementById("exportMarkdownButton").addEventListener("click", () =>
    post({ type: "exportTranscript", format: "markdown" })
  );
  document.getElementById("exportJsonButton").addEventListener("click", () =>
    post({ type: "exportTranscript", format: "json" })
  );
  document.getElementById("saveProfileButton").addEventListener("click", () => post({ type: "saveRoomProfile" }));
  document.getElementById("exportProfileButton").addEventListener("click", () => post({ type: "exportRoomProfile" }));
  document.getElementById("importProfileButton").addEventListener("click", () => post({ type: "importRoomProfile" }));
  document.getElementById("restoreProfileButton").addEventListener("click", () => post({ type: "restoreDefaultProfile" }));

  for (const [input, chip] of [
    [el.chipSelection, "selection"],
    [el.chipCurrentFile, "currentFile"],
    [el.chipGitStatus, "gitStatus"]
  ]) {
    input.addEventListener("change", () => post({ type: "toggleContextChip", chip, enabled: input.checked }));
  }

  post({ type: "ready" });
})();
