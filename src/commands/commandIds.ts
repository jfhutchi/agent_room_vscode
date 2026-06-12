export const COMMAND_IDS = [
  "agentRoom.open",
  "agentRoom.switchOperatingMode",
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

export type AgentRoomCommandId = (typeof COMMAND_IDS)[number];
