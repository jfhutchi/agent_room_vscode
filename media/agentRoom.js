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
      if (role.singleton) {
        const tag = document.createElement("span");
        tag.className = "role-singleton";
        tag.textContent = " (one holder)";
        roleName.appendChild(tag);
      }
      const roleDescription = document.createElement("div");
      roleDescription.className = "role-description";
      roleDescription.textContent = text(role.description);
      roleCell.append(roleName, roleDescription);
      row.appendChild(roleCell);
      const rowInputs = [];
      for (const agent of agents) {
        const label = document.createElement("label");
        label.className = "role-cell";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = (agent.assignedRoleIds || []).includes(role.id);
        input.addEventListener("change", () => {
          // Singleton roles allow at most one holder: checking one clears the
          // rest of the row immediately (the controller enforces it too).
          if (role.singleton && input.checked) {
            for (const other of rowInputs) {
              if (other !== input) other.checked = false;
            }
          }
          post({ type: "updateRoleAssignment", agentId: agent.id, roleId: role.id, assigned: input.checked });
        });
        rowInputs.push(input);
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

  const AVATAR_PALETTE = ["#6c8eef", "#e0728c", "#3aa675", "#c9893a", "#9a6fd0", "#3a9bb8", "#c2603a"];

  function hashIndex(value, count) {
    let hash = 0;
    const str = String(value || "");
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash % count;
  }

  function initialFor(name) {
    const match = String(name || "?").trim().match(/[A-Za-z0-9]/);
    return (match ? match[0] : "?").toUpperCase();
  }

  function messageKind(message) {
    if (message.participantKind === "user") return "user";
    if (message.participantKind === "conductor") return "conductor";
    if (message.participantKind === "system") return "system";
    return "agent";
  }

  function metaTag(message) {
    const parts = [];
    if (
      message.providerId &&
      message.providerId !== "human" &&
      message.providerId !== "internalConductor"
    ) {
      parts.push(providerName(message.providerId));
    }
    const model =
      message.concreteModelName ||
      (message.modelTier && message.modelTier !== "providerDefault" ? message.modelTier : null);
    if (model) parts.push(model);
    if (message.effortLevel) parts.push(`${message.effortLevel} effort`);
    return parts.join(" · ");
  }

  function messageTime(message) {
    const stamp = message.createdAt ? new Date(message.createdAt) : null;
    return stamp && !Number.isNaN(stamp.getTime())
      ? stamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
  }

  // --- Safe, DOM-only markdown rendering (no innerHTML; CSP intact) ----------
  function appendInline(parent, str) {
    const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      if (m.index > last) parent.appendChild(document.createTextNode(str.slice(last, m.index)));
      if (m[1] !== undefined) {
        const code = document.createElement("code");
        code.className = "md-code";
        code.textContent = m[1];
        parent.appendChild(code);
      } else if (m[2] !== undefined) {
        const strong = document.createElement("strong");
        strong.textContent = m[2];
        parent.appendChild(strong);
      } else if (m[3] !== undefined) {
        const em = document.createElement("em");
        em.textContent = m[3];
        parent.appendChild(em);
      } else if (m[4] !== undefined) {
        const a = document.createElement("a");
        a.href = m[5];
        a.textContent = m[4];
        a.target = "_blank";
        a.rel = "noreferrer";
        parent.appendChild(a);
      }
      last = re.lastIndex;
    }
    if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
  }

  function codeBlock(code, lang) {
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    const head = document.createElement("div");
    head.className = "code-head";
    const label = document.createElement("span");
    label.className = "code-lang";
    label.textContent = lang || "code";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "code-copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => navigator.clipboard?.writeText(code));
    head.append(label, copy);
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    wrap.append(head, pre);
    return wrap;
  }

  function renderMarkdown(container, src) {
    const lines = String(src).replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    let listEl = null;
    let listType = null;
    const flushList = () => {
      listEl = null;
      listType = null;
    };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(\w+)?\s*$/);
      if (fence) {
        flushList();
        const code = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        i++;
        container.appendChild(codeBlock(code.join("\n"), fence[1] || ""));
        continue;
      }
      if (/^\s*$/.test(line)) {
        flushList();
        i++;
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushList();
        const node = document.createElement(heading[1].length <= 2 ? "h3" : "h4");
        node.className = "md-h";
        appendInline(node, heading[2]);
        container.appendChild(node);
        i++;
        continue;
      }
      if (/^>\s?/.test(line)) {
        flushList();
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        const bq = document.createElement("blockquote");
        bq.className = "md-quote";
        appendInline(bq, quote.join(" "));
        container.appendChild(bq);
        continue;
      }
      const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (item) {
        const type = /\d+\./.test(item[2]) ? "ol" : "ul";
        if (!listEl || listType !== type) {
          flushList();
          listEl = document.createElement(type);
          listEl.className = "md-list";
          container.appendChild(listEl);
          listType = type;
        }
        const li = document.createElement("li");
        appendInline(li, item[3]);
        listEl.appendChild(li);
        i++;
        continue;
      }
      flushList();
      const para = [line];
      i++;
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !/^```/.test(lines[i]) &&
        !/^(#{1,6})\s/.test(lines[i]) &&
        !/^>\s?/.test(lines[i]) &&
        !/^(\s*)([-*+]|\d+\.)\s+/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      const p = document.createElement("p");
      p.className = "md-p";
      appendInline(p, para.join("\n"));
      container.appendChild(p);
    }
  }

  function renderTranscript() {
    el.transcript.textContent = "";
    const messages = state.transcript?.messages || [];
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No messages yet. Ask the room something to get started.";
      el.transcript.appendChild(empty);
      return;
    }
    for (const message of messages) {
      const kind = messageKind(message);
      const row = document.createElement("article");
      row.className = `msg msg-${kind}${message.status === "error" ? " msg-error" : ""}`;

      const avatar = document.createElement("div");
      avatar.className = "msg-avatar";
      avatar.textContent = initialFor(message.displayName);
      if (kind === "user") avatar.classList.add("is-user");
      else if (kind === "conductor" || kind === "system") avatar.classList.add("is-conductor");
      else avatar.style.background = AVATAR_PALETTE[hashIndex(message.participantId || message.displayName, AVATAR_PALETTE.length)];

      const main = document.createElement("div");
      main.className = "msg-main";

      const head = document.createElement("div");
      head.className = "msg-head";
      const author = document.createElement("span");
      author.className = "msg-author";
      author.textContent = text(message.displayName);
      const roles = (message.roleNames || []).join(", ");
      if (roles) author.title = roles;
      head.appendChild(author);
      const tag = metaTag(message);
      if (tag) {
        const tagEl = document.createElement("span");
        tagEl.className = "msg-tag";
        tagEl.textContent = tag;
        head.appendChild(tagEl);
      }
      const time = messageTime(message);
      if (time) {
        const timeEl = document.createElement("span");
        timeEl.className = "msg-time";
        timeEl.textContent = time;
        head.appendChild(timeEl);
      }
      if (message.status && message.status !== "complete") {
        const statusEl = document.createElement("span");
        statusEl.className = `msg-status ${message.status}`;
        statusEl.textContent = message.status === "running" ? "working…" : message.status;
        head.appendChild(statusEl);
      }

      const actions = document.createElement("span");
      actions.className = "msg-actions";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => navigator.clipboard?.writeText(message.content || ""));
      const reply = document.createElement("button");
      reply.type = "button";
      reply.textContent = "Reply";
      reply.addEventListener("click", () => {
        state.replyTo = { id: message.id, name: message.displayName };
        renderReplyChip();
        el.text.focus();
      });
      actions.append(copy, reply);
      head.appendChild(actions);

      const body = document.createElement("div");
      body.className = "msg-body";
      if (message.content) {
        renderMarkdown(body, message.content);
      } else {
        body.classList.add("msg-empty-body");
        body.textContent = message.status === "running" ? "Working…" : "(no output)";
      }

      main.append(head, body);
      if (message.diagnostics && state.showDiagnostics) {
        const details = document.createElement("details");
        details.className = "msg-diagnostics";
        const summary = document.createElement("summary");
        summary.textContent = "Diagnostics";
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(message.diagnostics, null, 2);
        details.append(summary, pre);
        main.appendChild(details);
      }
      row.append(avatar, main);
      el.transcript.appendChild(row);
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
  document.getElementById("startBuildButton").addEventListener("click", () => {
    if (!el.text.value.trim()) return;
    post({ type: "startOrchestratedBuild", text: el.text.value });
    el.text.value = "";
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
