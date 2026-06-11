import * as vscode from "vscode";
import { AgentRoomController } from "../core/AgentRoomController";

export const COMMAND_IDS = [
  "agentRoom.open",
  "agentRoom.checkCliHealth",
  "agentRoom.openRoomSetup",
  "agentRoom.resetRoleAssignments",
  "agentRoom.exportRoomProfile",
  "agentRoom.importRoomProfile",
  "agentRoom.sendCurrentSelectionToAtlas",
  "agentRoom.sendCurrentSelectionToForge",
  "agentRoom.sendCurrentSelectionToSentinel",
  "agentRoom.sendCurrentSelectionToGauge",
  "agentRoom.sendCurrentSelectionToScout",
  "agentRoom.sendSelectionToAssignedPlanner",
  "agentRoom.sendSelectionToAssignedCoder",
  "agentRoom.sendSelectionToAssignedReviewer",
  "agentRoom.runPlanningWorkflowOnCurrentFile",
  "agentRoom.runFullBuildCycleOnCurrentFile",
  "agentRoom.exportTranscript",
  "agentRoom.clearTranscript",
  "agentRoom.openSettings"
] as const;

export function registerCommands(context: vscode.ExtensionContext, controller: AgentRoomController): void {
  const registrations: Array<[string, () => unknown]> = [
    ["agentRoom.open", () => controller.open()],
    ["agentRoom.checkCliHealth", () => controller.checkCliHealth()],
    ["agentRoom.openRoomSetup", () => controller.openRoomSetup()],
    ["agentRoom.resetRoleAssignments", () => controller.resetRoleAssignments()],
    ["agentRoom.exportRoomProfile", () => controller.exportRoomProfile()],
    ["agentRoom.importRoomProfile", () => controller.importRoomProfile()],
    ["agentRoom.sendCurrentSelectionToAtlas", () => controller.sendCurrentSelectionToAgent("atlas")],
    ["agentRoom.sendCurrentSelectionToForge", () => controller.sendCurrentSelectionToAgent("forge")],
    ["agentRoom.sendCurrentSelectionToSentinel", () => controller.sendCurrentSelectionToAgent("sentinel")],
    ["agentRoom.sendCurrentSelectionToGauge", () => controller.sendCurrentSelectionToAgent("gauge")],
    ["agentRoom.sendCurrentSelectionToScout", () => controller.sendCurrentSelectionToAgent("scout")],
    ["agentRoom.sendSelectionToAssignedPlanner", () => controller.sendCurrentSelectionToRole("planner")],
    ["agentRoom.sendSelectionToAssignedCoder", () => controller.sendCurrentSelectionToRole("coder")],
    ["agentRoom.sendSelectionToAssignedReviewer", () => controller.sendCurrentSelectionToRole("reviewer")],
    ["agentRoom.runPlanningWorkflowOnCurrentFile", () => controller.runWorkflowOnCurrentFile("planningOnly")],
    ["agentRoom.runFullBuildCycleOnCurrentFile", () => controller.runWorkflowOnCurrentFile("fullBuildCycle")],
    ["agentRoom.exportTranscript", () => controller.exportTranscript("markdown")],
    ["agentRoom.clearTranscript", () => controller.clearTranscript()],
    ["agentRoom.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "agentRoom")]
  ];

  for (const [id, callback] of registrations) {
    context.subscriptions.push(vscode.commands.registerCommand(id, callback));
  }
}
