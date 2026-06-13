import { AgentRoomMessage, ModelAdvisorRecommendation, RoleId } from "./Types";

/**
 * Typing indicator text (SPEC §12): "Atlas is planning…", "Forge is
 * coding…", "Sentinel is reviewing…", "Gauge is checking tests…",
 * "Scout is researching…", "Conductor is summarizing…".
 */
export function typingIndicatorFor(displayName: string, roleIds: RoleId[]): string {
  const has = (...ids: string[]) => ids.some((id) => roleIds.includes(id));
  const verb = has("planner", "architect")
    ? "planning"
    : has("coder")
      ? "coding"
      : has("reviewer", "securityAuditor", "codeQualityAuditor")
        ? "reviewing"
        : has("tester", "devOpsReviewer")
          ? "checking tests"
          : has("webResearcher", "sourceChecker", "documentationFinder", "currentInfoVerifier")
            ? "researching"
            : has("documentationWriter")
              ? "writing docs"
              : has("transcriptSummarizer", "moderator")
                ? "summarizing"
                : "working";
  return `${displayName} is ${verb}…`;
}

export class Conductor {
  recommendationText(recommendation: ModelAdvisorRecommendation): string {
    const agents = recommendation.agentPlan.map((entry) => entry.displayName).join(", ");
    const warnings = recommendation.warnings.length
      ? `\n\nWarnings:\n${recommendation.warnings.map((warning) => `- ${warning}`).join("\n")}`
      : "";
    return `I recommend ${recommendation.workflowName}. Participants: ${agents || "none"}.${warnings}`;
  }

  summarize(messages: AgentRoomMessage[]): string {
    const completed = messages.filter((message) => message.status === "complete");
    const errors = messages.filter((message) => message.status === "error");
    return [
      `Summary: ${completed.length} completed message(s), ${errors.length} error(s).`,
      errors.length ? "Review diagnostics on failed messages before continuing." : "No failed messages in this transcript."
    ].join("\n");
  }
}
