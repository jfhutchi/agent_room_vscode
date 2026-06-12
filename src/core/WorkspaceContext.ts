import * as vscode from "vscode";
import { RoomContextSnapshot } from "./Types";
import { collectGitContext } from "./GitContext";

export async function collectWorkspaceContext(options: {
  includeSelection: boolean;
  includeCurrentFile: boolean;
  includeGitStatus: boolean;
}): Promise<RoomContextSnapshot> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const editor = vscode.window.activeTextEditor;
  const chips: string[] = [];
  let selection: string | undefined;
  let currentFileContents: string | undefined;

  if (editor && options.includeSelection && !editor.selection.isEmpty) {
    selection = editor.document.getText(editor.selection);
    chips.push("selection");
  }
  if (editor && options.includeCurrentFile) {
    currentFileContents = editor.document.getText();
    chips.push("currentFile");
  }

  let gitBranch: string | undefined;
  let gitStatusSummary: string | undefined;
  if (folder && options.includeGitStatus) {
    const git = await collectGitContext(folder.uri.fsPath);
    if (git.available) {
      gitBranch = git.branch;
      gitStatusSummary = [git.statusSummary, git.diffStat].filter(Boolean).join("\n");
      chips.push("gitStatus");
    }
  }

  return {
    workspacePath: folder?.uri.fsPath,
    workspaceName: folder?.name,
    gitBranch,
    gitStatusSummary,
    currentFilePath: editor?.document.uri.fsPath,
    currentFileLanguageId: editor?.document.languageId,
    currentFileDirty: editor?.document.isDirty,
    selection,
    currentFileContents,
    contextChips: chips
  };
}
