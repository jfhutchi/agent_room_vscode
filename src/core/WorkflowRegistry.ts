/**
 * Built-in and custom workflow definitions. A workflow is an ordered list of
 * role-based steps; the runner resolves each step to an enabled team member
 * holding one of the step's roles. Steps never name a hardcoded agent —
 * Atlas/Forge/Sentinel/Gauge appear only as *preferred* defaults.
 */

import { ROLE_IDS } from "./RoleRegistry";
import { newId, WorkflowDefinition, WorkflowId, WorkflowStep } from "./Types";

export const WORKFLOW_IDS = {
  manual: "manual",
  planningOnly: "planningOnly",
  planReview: "planReview",
  planReviewCode: "planReviewCode",
  codeReview: "codeReview",
  securityReview: "securityReview",
  testReview: "testReview",
  researchPlanReviewCode: "researchPlanReviewCode",
  fullBuildCycle: "fullBuildCycle",
  roundtable: "roundtable",
  adversarialReview: "adversarialReview",
  documentationPass: "documentationPass",
  claimVerification: "claimVerification"
} as const;

function step(partial: Partial<WorkflowStep> & Pick<WorkflowStep, "id" | "name">): WorkflowStep {
  return {
    description: "",
    anyOfRoleIds: [],
    instructions: "",
    allowsFileChanges: false,
    optional: false,
    speaker: "agent",
    ...partial
  };
}

function conductorSummary(id: string, instructions: string): WorkflowStep {
  return step({
    id,
    name: "Conductor summary",
    speaker: "conductor",
    instructions
  });
}

export function builtInWorkflows(): WorkflowDefinition[] {
  return [
    {
      id: WORKFLOW_IDS.manual,
      name: "Manual",
      description: "You choose who answers. Role instructions are still applied.",
      isBuiltIn: true,
      steps: []
    },
    {
      id: WORKFLOW_IDS.planningOnly,
      name: "Planning Only",
      description: "A Planner or Architect produces a plan; the Conductor summarizes.",
      isBuiltIn: true,
      steps: [
        step({
          id: "plan",
          name: "Plan",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect],
          instructions:
            "Produce a clear, ordered implementation plan for the user's request. State assumptions and dependencies explicitly.",
          expectedOutput: "A numbered plan with assumptions, dependencies, and open questions."
        }),
        conductorSummary("summary", "Summarize the plan, its assumptions, and open risks.")
      ]
    },
    {
      id: WORKFLOW_IDS.planReview,
      name: "Plan → Review",
      description: "Plan, skeptical review, one revision, then a summary.",
      isBuiltIn: true,
      steps: [
        step({
          id: "plan",
          name: "Plan",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect],
          instructions: "Create an implementation plan for the user's request.",
          expectedOutput: "A numbered plan with assumptions and dependencies."
        }),
        step({
          id: "review",
          name: "Review plan",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          instructions:
            "Review the plan above skeptically. Identify incorrect assumptions, missing requirements, risks, and anything underspecified.",
          expectedOutput: "A list of specific concerns, each tied to a part of the plan."
        }),
        step({
          id: "revise",
          name: "Revise plan",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect],
          instructions:
            "Revise the plan once, addressing the reviewer's concerns. Note any concerns you reject and why.",
          expectedOutput: "The revised plan plus a short response to each concern."
        }),
        conductorSummary(
          "summary",
          "Summarize the accepted plan, remaining concerns, and open risks."
        )
      ]
    },
    {
      id: WORKFLOW_IDS.planReviewCode,
      name: "Plan → Review → Code",
      description: "Plan, review, revise, implement, verify, summarize.",
      isBuiltIn: true,
      steps: [
        step({
          id: "plan",
          name: "Plan",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect],
          instructions: "Create an implementation plan for the user's request."
        }),
        step({
          id: "review",
          name: "Review plan",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          instructions: "Critique the plan: assumptions, gaps, risks, and missing requirements."
        }),
        step({
          id: "revise",
          name: "Revise plan",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect],
          instructions: "Revise the plan to address the review."
        }),
        step({
          id: "implement",
          name: "Implement",
          anyOfRoleIds: [ROLE_IDS.coder],
          allowsFileChanges: true,
          requiresReviewAfter: true,
          instructions:
            "Implement the revised plan. List the exact files you changed. If you could not change files, say so honestly.",
          expectedOutput: "Implementation summary with the exact list of files changed."
        }),
        step({
          id: "verify",
          name: "Verify",
          anyOfRoleIds: [ROLE_IDS.tester, ROLE_IDS.reviewer],
          optional: true,
          instructions:
            "Check the implementation against the plan. Identify defects, missing pieces, and untested behavior."
        }),
        conductorSummary("summary", "Summarize files changed, verification results, and risks.")
      ]
    },
    {
      id: WORKFLOW_IDS.codeReview,
      name: "Code → Review",
      description: "Implement, review, one fix pass, summarize.",
      isBuiltIn: true,
      steps: [
        step({
          id: "implement",
          name: "Implement",
          anyOfRoleIds: [ROLE_IDS.coder],
          allowsFileChanges: true,
          instructions:
            "Implement the user's request. List the exact files you changed."
        }),
        step({
          id: "review",
          name: "Review",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          instructions:
            "Review the implementation skeptically: bugs, missed requirements, unclear logic, and risky edges."
        }),
        step({
          id: "fix",
          name: "Fix pass",
          anyOfRoleIds: [ROLE_IDS.coder],
          allowsFileChanges: true,
          instructions:
            "Apply one fix pass addressing the review findings. List the files you changed; note any findings you dispute."
        }),
        conductorSummary("summary", "Summarize what was implemented, reviewed, and fixed.")
      ]
    },
    {
      id: WORKFLOW_IDS.securityReview,
      name: "Security Review",
      description: "A Security Auditor reviews the request/context; severity summary.",
      isBuiltIn: true,
      steps: [
        step({
          id: "audit",
          name: "Security audit",
          anyOfRoleIds: [ROLE_IDS.securityAuditor],
          instructions:
            "Audit the selected context, request, transcript, or files for: unsafe command execution, credential exposure, secret logging, over-permissioned behavior, destructive operations, prompt injection risks, and webview concerns. Rate severity for each finding.",
          expectedOutput: "Findings grouped by severity with concrete remediation steps."
        }),
        conductorSummary("summary", "Summarize the findings by severity.")
      ]
    },
    {
      id: WORKFLOW_IDS.testReview,
      name: "Test Review",
      description: "A Tester maps missing coverage; Coder may add tests if allowed.",
      isBuiltIn: true,
      steps: [
        step({
          id: "assess",
          name: "Assess coverage",
          anyOfRoleIds: [ROLE_IDS.tester],
          instructions:
            "Review the plan or implementation. List missing tests and suggest exact test cases (names, inputs, expected outcomes)."
        }),
        step({
          id: "addTests",
          name: "Add tests",
          anyOfRoleIds: [ROLE_IDS.coder],
          optional: true,
          allowsFileChanges: true,
          instructions:
            "If safety mode allows file changes, add the tests suggested above. List the files you changed."
        }),
        conductorSummary("summary", "Summarize coverage gaps and any tests added.")
      ]
    },
    {
      id: WORKFLOW_IDS.researchPlanReviewCode,
      name: "Research → Plan → Review → Code",
      description: "Web research feeds a cited plan, review, implementation, verification.",
      isBuiltIn: true,
      steps: [
        step({
          id: "research",
          name: "Research",
          anyOfRoleIds: [ROLE_IDS.webResearcher],
          instructions:
            "Research current official docs and relevant sources for this request. Cite every finding with a source link.",
          expectedOutput: "Findings with citations."
        }),
        step({
          id: "plan",
          name: "Plan",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect],
          instructions: "Create an implementation plan using the researcher's cited findings."
        }),
        step({
          id: "review",
          name: "Review plan",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          instructions:
            "Check the plan against the researcher's sources and the stated constraints."
        }),
        step({
          id: "implement",
          name: "Implement",
          anyOfRoleIds: [ROLE_IDS.coder],
          allowsFileChanges: true,
          instructions: "Implement the plan. List the exact files you changed."
        }),
        step({
          id: "verify",
          name: "Verify",
          anyOfRoleIds: [ROLE_IDS.tester, ROLE_IDS.reviewer],
          optional: true,
          instructions: "Validate the implementation against plan and sources."
        }),
        conductorSummary("summary", "Summarize sources, plan, changes, and risks.")
      ]
    },
    {
      id: WORKFLOW_IDS.fullBuildCycle,
      name: "Full Build Cycle",
      description:
        "Research (optional) → plan → architecture → review → implement → test → final review → fix → summary.",
      isBuiltIn: true,
      steps: [
        step({
          id: "research",
          name: "Research",
          anyOfRoleIds: [ROLE_IDS.webResearcher],
          optional: true,
          instructions:
            "If current external information would help, research official docs first and cite sources."
        }),
        step({
          id: "plan",
          name: "Plan",
          anyOfRoleIds: [ROLE_IDS.planner],
          instructions: "Break down the requirements into an ordered implementation plan."
        }),
        step({
          id: "architecture",
          name: "Architecture",
          anyOfRoleIds: [ROLE_IDS.architect],
          instructions:
            "Propose the system structure: modules, interfaces, and file organization for the plan."
        }),
        step({
          id: "review",
          name: "Review plan",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          instructions: "Critique the plan and architecture: risks, gaps, and weak assumptions."
        }),
        step({
          id: "implement",
          name: "Implement",
          anyOfRoleIds: [ROLE_IDS.coder],
          allowsFileChanges: true,
          instructions: "Implement the reviewed plan. List the exact files you changed."
        }),
        step({
          id: "test",
          name: "Test coverage",
          anyOfRoleIds: [ROLE_IDS.tester],
          instructions:
            "Check test coverage of the implementation. List missing cases and exact suggested tests."
        }),
        step({
          id: "finalReview",
          name: "Final review",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          instructions: "Final review of the implementation and test coverage."
        }),
        step({
          id: "fix",
          name: "Fix pass",
          anyOfRoleIds: [ROLE_IDS.coder],
          optional: true,
          allowsFileChanges: true,
          instructions:
            "If the final review found issues, apply one fix pass and list the files you changed."
        }),
        conductorSummary(
          "summary",
          "Summarize the build: plan, files changed, test gaps, and remaining risks."
        )
      ]
    },
    {
      id: WORKFLOW_IDS.roundtable,
      name: "Roundtable",
      description:
        "Claude-backed and Codex-backed members debate the question; the Conductor reports agreement and disagreement.",
      isBuiltIn: true,
      steps: [
        step({
          id: "claudeOpens",
          name: "Claude-backed opening",
          anyOfRoleIds: [
            ROLE_IDS.planner,
            ROLE_IDS.architect,
            ROLE_IDS.coder,
            ROLE_IDS.explainer
          ],
          preferredProviderId: "claudeCodeCli",
          instructions: "Give your position on the user's question using your assigned roles."
        }),
        step({
          id: "codexResponds",
          name: "Codex-backed response",
          anyOfRoleIds: [
            ROLE_IDS.reviewer,
            ROLE_IDS.tester,
            ROLE_IDS.securityAuditor,
            ROLE_IDS.codeQualityAuditor
          ],
          preferredProviderId: "codexCli",
          instructions:
            "Respond to the previous position. Agree or disagree with specifics, using your assigned roles."
        }),
        step({
          id: "claudeReplies",
          name: "Claude-backed reply",
          anyOfRoleIds: [
            ROLE_IDS.planner,
            ROLE_IDS.architect,
            ROLE_IDS.coder,
            ROLE_IDS.explainer
          ],
          preferredProviderId: "claudeCodeCli",
          instructions: "Reply to the response: concede valid points, defend the rest."
        }),
        step({
          id: "codexFinal",
          name: "Codex-backed final check",
          anyOfRoleIds: [
            ROLE_IDS.reviewer,
            ROLE_IDS.tester,
            ROLE_IDS.securityAuditor,
            ROLE_IDS.codeQualityAuditor
          ],
          preferredProviderId: "codexCli",
          instructions: "Final check: state what is now agreed and what remains contested."
        }),
        conductorSummary(
          "summary",
          "Summarize agreement, disagreement, the recommendation, risks, and the next action."
        )
      ]
    },
    {
      id: WORKFLOW_IDS.adversarialReview,
      name: "Adversarial Review",
      description: "One agent proposes; an adversarial reviewer attacks; fixes; final check.",
      isBuiltIn: true,
      steps: [
        step({
          id: "propose",
          name: "Propose",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect, ROLE_IDS.coder],
          instructions: "Propose or implement an answer to the user's request."
        }),
        step({
          id: "attack",
          name: "Adversarial review",
          anyOfRoleIds: [ROLE_IDS.reviewer, ROLE_IDS.securityAuditor],
          instructions:
            "Attack the proposal's assumptions as hard as you can. Find the strongest failure cases."
        }),
        step({
          id: "respond",
          name: "Respond with fixes",
          anyOfRoleIds: [ROLE_IDS.planner, ROLE_IDS.architect, ROLE_IDS.coder],
          instructions: "Respond to the attack with concrete fixes or rebuttals."
        }),
        step({
          id: "finalCheck",
          name: "Final check",
          anyOfRoleIds: [ROLE_IDS.reviewer, ROLE_IDS.securityAuditor],
          instructions: "Final check: which concerns are resolved, which still stand."
        }),
        conductorSummary("summary", "Summarize the strongest surviving concerns.")
      ]
    },
    {
      id: WORKFLOW_IDS.documentationPass,
      name: "Documentation Pass",
      description: "Docs drafted, clarity-reviewed, optionally applied.",
      isBuiltIn: true,
      steps: [
        step({
          id: "draft",
          name: "Draft docs",
          anyOfRoleIds: [ROLE_IDS.documentationWriter],
          instructions:
            "Draft README/usage/changelog updates for the user's request. Document only behavior that exists."
        }),
        step({
          id: "review",
          name: "Clarity review",
          anyOfRoleIds: [ROLE_IDS.reviewer],
          optional: true,
          instructions: "Check the docs for clarity, accuracy, and missing steps."
        }),
        step({
          id: "apply",
          name: "Apply docs",
          anyOfRoleIds: [ROLE_IDS.coder],
          optional: true,
          allowsFileChanges: true,
          instructions:
            "If safety mode allows, apply the documentation changes to the repository. List files changed."
        }),
        conductorSummary("summary", "Summarize the documentation changes.")
      ]
    },
    {
      id: WORKFLOW_IDS.claimVerification,
      name: "Claim Verification",
      description: "A Source Checker verifies a claim; the Conductor reports the verdict.",
      isBuiltIn: true,
      steps: [
        step({
          id: "verify",
          name: "Verify claim",
          anyOfRoleIds: [ROLE_IDS.sourceChecker],
          instructions:
            "Verify the claim in the latest user message against current sources, official docs first. Conclude Confirmed, Contradicted, or Unclear, with sources.",
          expectedOutput: "Verdict (Confirmed / Contradicted / Unclear) with source links."
        }),
        conductorSummary("summary", "Report the verdict and sources.")
      ]
    }
  ];
}

export interface CustomWorkflowStepInput {
  name: string;
  requiredRoleId: string;
  preferredAgentId?: string;
  promptInstructions: string;
  allowsFileChanges: boolean;
  requiresReviewAfter: boolean;
}

export class WorkflowRegistry {
  private workflows: Map<WorkflowId, WorkflowDefinition>;

  constructor(initial?: WorkflowDefinition[]) {
    this.workflows = new Map((initial ?? builtInWorkflows()).map((w) => [w.id, w]));
  }

  all(): WorkflowDefinition[] {
    return [...this.workflows.values()];
  }

  get(id: WorkflowId): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  createCustomWorkflow(input: {
    name: string;
    description: string;
    steps: CustomWorkflowStepInput[];
  }): WorkflowDefinition {
    const def: WorkflowDefinition = {
      id: newId("workflow"),
      name: input.name,
      description: input.description,
      isBuiltIn: false,
      steps: input.steps.map((s, i) =>
        step({
          id: `step-${i + 1}`,
          name: s.name,
          anyOfRoleIds: [s.requiredRoleId],
          preferredAgentId: s.preferredAgentId,
          instructions: s.promptInstructions,
          allowsFileChanges: s.allowsFileChanges,
          requiresReviewAfter: s.requiresReviewAfter
        })
      )
    };
    this.workflows.set(def.id, def);
    return def;
  }

  deleteWorkflow(id: WorkflowId): void {
    const wf = this.workflows.get(id);
    if (!wf) return;
    if (wf.isBuiltIn) throw new Error(`Built-in workflow "${wf.name}" cannot be deleted.`);
    this.workflows.delete(id);
  }

  restoreDefaults(): void {
    const customs = this.all().filter((w) => !w.isBuiltIn);
    this.workflows = new Map(builtInWorkflows().map((w) => [w.id, w]));
    for (const c of customs) this.workflows.set(c.id, c);
  }
}
