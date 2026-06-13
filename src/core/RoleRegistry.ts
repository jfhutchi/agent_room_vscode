/**
 * Role definitions and role CRUD. Roles are responsibilities, not agents:
 * any team member can hold zero, one, or many roles, and a role can be held
 * by several team members at once.
 */

import { newId, RoleDefinition, RoleId } from "./Types";

export const ROLE_IDS = {
  productOwner: "productOwner",
  finalApprover: "finalApprover",
  planner: "planner",
  architect: "architect",
  coder: "coder",
  reviewer: "reviewer",
  tester: "tester",
  securityAuditor: "securityAuditor",
  codeQualityAuditor: "codeQualityAuditor",
  devOpsReviewer: "devOpsReviewer",
  documentationWriter: "documentationWriter",
  explainer: "explainer",
  webResearcher: "webResearcher",
  sourceChecker: "sourceChecker",
  documentationFinder: "documentationFinder",
  currentInfoVerifier: "currentInfoVerifier",
  moderator: "moderator",
  workflowCoordinator: "workflowCoordinator",
  transcriptSummarizer: "transcriptSummarizer",
  safetyGatekeeper: "safetyGatekeeper",
  modelAdvisor: "modelAdvisor"
} as const;

function role(
  id: string,
  name: string,
  description: string,
  instructions: string,
  singleton = false
): RoleDefinition {
  return { id, name, description, instructions, isBuiltIn: true, singleton };
}

export function builtInRoles(): RoleDefinition[] {
  return [
    role(
      ROLE_IDS.productOwner,
      "Product Owner",
      "Clarifies goals, priorities, user value, and acceptance criteria.",
      "Represent the human user's intent. Clarify goals, priorities, user value, and acceptance criteria. Push back when scope is unclear.",
      true
    ),
    role(
      ROLE_IDS.finalApprover,
      "Final Approver",
      "Holds final authority over decisions and merges.",
      "You have final authority. Other participants must not claim final approval. By default this role belongs to the human user; never override the human.",
      true
    ),
    role(
      ROLE_IDS.planner,
      "Planner",
      "Breaks requests into steps with assumptions and dependencies.",
      "Break the user request into concrete steps. State assumptions explicitly. Identify dependencies and risks. Produce a clear, ordered implementation plan. Do not write code unless you also hold the Coder role."
    ),
    role(
      ROLE_IDS.architect,
      "Architect",
      "Designs system structure, interfaces, and module boundaries.",
      "Design the system structure. Choose file organization, define interfaces and module boundaries, and flag long-term maintainability issues. Prefer simple designs over clever ones."
    ),
    role(
      ROLE_IDS.coder,
      "Coder",
      "Implements requested changes as concrete file edits.",
      "Implement the requested changes. Produce concrete file edits and summarize the exact files you changed. If you did not change files, say so plainly. Avoid broad architecture debate unless you also hold Planner or Architect."
    ),
    role(
      ROLE_IDS.reviewer,
      "Reviewer",
      "Skeptically reviews other agents' output for bugs and gaps.",
      "Review the referenced output skeptically and specifically. Look for incorrect assumptions, bugs, missing requirements, and unclear logic. Cite the exact lines or claims you dispute. Do not rubber-stamp."
    ),
    role(
      ROLE_IDS.tester,
      "Tester",
      "Creates or recommends tests and finds missing edge cases.",
      "Create or recommend tests. Check whether the acceptance criteria are covered, identify missing edge cases, and name the exact test cases that should exist."
    ),
    role(
      ROLE_IDS.securityAuditor,
      "Security Auditor",
      "Hunts for unsafe execution, credential exposure, and injection risks.",
      "Audit for: unsafe shell execution, credential exposure, prompt injection risks, destructive commands, unsafe file writes, overbroad permissions, and webview security problems. Rate severity of each finding and propose a fix."
    ),
    role(
      ROLE_IDS.codeQualityAuditor,
      "Code Quality Auditor",
      "Checks maintainability, complexity, error handling, and consistency.",
      "Check maintainability, unnecessary complexity, error handling, file organization, and consistency with the surrounding codebase. Be specific about what to simplify."
    ),
    role(
      ROLE_IDS.devOpsReviewer,
      "DevOps Reviewer",
      "Checks packaging, CI/CD, installation, and cross-platform issues.",
      "Check packaging, CI/CD, installation issues, cross-platform concerns (Windows/macOS/Linux/WSL), release workflow, and VS Code extension packaging concerns."
    ),
    role(
      ROLE_IDS.documentationWriter,
      "Documentation Writer",
      "Writes README, usage instructions, troubleshooting, and changelogs.",
      "Write or update README content, usage instructions, troubleshooting sections, changelog notes, and architecture docs. Keep prose tight and accurate; never document behavior that does not exist."
    ),
    role(
      ROLE_IDS.explainer,
      "Explainer",
      "Explains code and decisions clearly for the team.",
      "Explain code, designs, and decisions clearly and accurately for a professional team. Use short examples where helpful. Do not speculate beyond what you can see."
    ),
    role(
      ROLE_IDS.webResearcher,
      "Web Researcher",
      "Looks up current external information with citations.",
      "Look up current external information, preferring official documentation. Summarize findings and provide source links for every claim. Do not modify files. Do not speculate beyond sources."
    ),
    role(
      ROLE_IDS.sourceChecker,
      "Source Checker",
      "Verifies claims against current sources.",
      "Verify claims made by the user or other agents. Check official docs first. Flag outdated or uncertain claims. Conclude each claim as Confirmed, Contradicted, or Unclear, with links."
    ),
    role(
      ROLE_IDS.documentationFinder,
      "Documentation Finder",
      "Finds official API docs, package docs, release notes, and examples.",
      "Find official API docs, package docs, release notes, migration guides, and examples relevant to the request. Provide links and one-line summaries."
    ),
    role(
      ROLE_IDS.currentInfoVerifier,
      "Current Info Verifier",
      "Checks whether commands, versions, flags, or APIs changed recently.",
      "Check whether commands, package versions, CLI flags, APIs, or product behavior have changed recently. Warn when information in the room may be stale, with the source that shows the change."
    ),
    role(
      ROLE_IDS.moderator,
      "Moderator",
      "Keeps the room organized and prevents runaway turns.",
      "Keep the room organized. Decide who speaks next in a workflow. Prevent duplicate or runaway turns."
    ),
    role(
      ROLE_IDS.workflowCoordinator,
      "Workflow Coordinator",
      "Sequences agent turns and routes the right context to each.",
      "Build the sequence of agent turns and send each participant the right context and role instructions."
    ),
    role(
      ROLE_IDS.transcriptSummarizer,
      "Transcript Summarizer",
      "Summarizes agreement, disagreement, risks, and next steps.",
      "Summarize agreement, disagreement, risks, and next steps from the transcript. Do not invent facts; only report what participants actually said."
    ),
    role(
      ROLE_IDS.safetyGatekeeper,
      "Safety Gatekeeper",
      "Blocks dangerous actions unless explicitly enabled.",
      "Block dangerous actions unless explicitly enabled by the user. Warn before destructive or high-risk operations."
    ),
    role(
      ROLE_IDS.modelAdvisor,
      "Model Advisor",
      "Suggests workflow, agents, model tiers, context, and safety mode.",
      "Suggest workflow, team members, role usage, model tiers, context level, and safety mode. Stay advisory: never silently force expensive or deep models."
    )
  ];
}

export class RoleRegistry {
  private roles: Map<RoleId, RoleDefinition>;

  constructor(initial?: RoleDefinition[]) {
    this.roles = new Map((initial ?? builtInRoles()).map((r) => [r.id, r]));
  }

  all(): RoleDefinition[] {
    return [...this.roles.values()];
  }

  get(id: RoleId): RoleDefinition | undefined {
    return this.roles.get(id);
  }

  getMany(ids: RoleId[]): RoleDefinition[] {
    return ids
      .map((id) => this.roles.get(id))
      .filter((r): r is RoleDefinition => r !== undefined);
  }

  createCustomRole(input: {
    name: string;
    description: string;
    instructions: string;
  }): RoleDefinition {
    const def: RoleDefinition = {
      id: newId("role"),
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      isBuiltIn: false
    };
    this.roles.set(def.id, def);
    return def;
  }

  updateCustomRole(
    id: RoleId,
    patch: Partial<Pick<RoleDefinition, "name" | "description" | "instructions">>
  ): RoleDefinition {
    const existing = this.roles.get(id);
    if (!existing) throw new Error(`Role not found: ${id}`);
    if (existing.isBuiltIn) throw new Error(`Built-in role "${existing.name}" cannot be edited.`);
    const updated = { ...existing, ...patch };
    this.roles.set(id, updated);
    return updated;
  }

  /**
   * Delete a role. Built-in roles are protected unless `allowBuiltIn` is
   * explicitly passed (used only by "restore defaults").
   */
  deleteRole(id: RoleId, allowBuiltIn = false): void {
    const existing = this.roles.get(id);
    if (!existing) return;
    if (existing.isBuiltIn && !allowBuiltIn) {
      throw new Error(`Built-in role "${existing.name}" cannot be deleted.`);
    }
    this.roles.delete(id);
  }

  restoreDefaults(): void {
    const customs = this.all().filter((r) => !r.isBuiltIn);
    this.roles = new Map(builtInRoles().map((r) => [r.id, r]));
    for (const c of customs) this.roles.set(c.id, c);
  }
}
