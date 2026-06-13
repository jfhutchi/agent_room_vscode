import * as vscode from "vscode";
import { AgentRoomController } from "../core/AgentRoomController";
import { AgentRoomCommandId } from "./commandIds";

export function registerCommands(context: vscode.ExtensionContext, controller: AgentRoomController): void {
  const registrations: Array<[AgentRoomCommandId, () => unknown]> = [
    ["agentRoom.open", () => controller.open()],
    ["agentRoom.switchOperatingMode", () => controller.switchOperatingMode()],
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
    ["agentRoom.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "agentRoom")],
    ["agentRoom.generateCopilotCustomAgents", () => controller.generateCopilotCustomAgents()],
    ["agentRoom.previewCopilotCustomAgents", () => controller.previewCopilotCustomAgents()],
    ["agentRoom.openCopilotCustomAgentsFolder", () => controller.openCopilotCustomAgentsFolder()],
    ["agentRoom.checkCopilotCapabilities", () => controller.checkCopilotCapabilities()],
    ["agentRoom.startOrchestratedBuild", () => controller.startOrchestratedBuild()]
  ];

  for (const [id, callback] of registrations) {
    context.subscriptions.push(vscode.commands.registerCommand(id, callback));
  }
}
