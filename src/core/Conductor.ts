import { AgentRoomMessage, ModelAdvisorRecommendation } from "./Types";

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
