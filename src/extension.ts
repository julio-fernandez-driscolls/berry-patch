import * as vscode from "vscode";
import { PrReviewController } from "./controller";

export function activate(context: vscode.ExtensionContext): void {
  const controller = new PrReviewController(context);

  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand("prReviewer.open", () => controller.open()),
    vscode.commands.registerCommand("prReviewer.refresh", () => controller.refresh()),
    vscode.commands.registerCommand("prReviewer.connectCodex", () => controller.connectCodex()),
    vscode.commands.registerCommand("prReviewer.selectEngine", () => controller.selectEngine()),
    vscode.workspace.onDidChangeConfiguration((e) => controller.onConfigChanged(e)),
  );

  // Populate the status bar count without prompting for sign-in on startup.
  void controller.refresh(false);
}

export function deactivate(): void {}
