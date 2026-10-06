import * as vscode from "vscode";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkCodex, subscriptionEnvironment } from "./codex";
import type { EngineStatus } from "./shared/protocol";

export function codexExecutable(): string {
  const configured = vscode.workspace.getConfiguration("prReviewer").get<string>("codexPath", "").trim();
  if (configured) return configured;
  const extension = vscode.extensions.getExtension("openai.chatgpt");
  if (extension) {
    const platform = process.platform === "win32" ? "windows" : process.platform;
    const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch;
    const binary = process.platform === "win32" ? "codex.exe" : "codex";
    const bundled = join(extension.extensionPath, "bin", `${platform}-${arch}`, binary);
    if (existsSync(bundled)) return bundled;
  }
  return process.platform === "win32" ? "codex.exe" : "codex";
}

export async function signInCodex(): Promise<void> {
  const error = await checkCodex(codexExecutable());
  if (!error) {
    void vscode.window.showInformationMessage("Codex is connected with ChatGPT. Reviews use your subscription limits.");
    return;
  }
  // Run the executable directly; no shell interpolation of paths or arguments.
  const env: Record<string, string | null> = {};
  const filtered = subscriptionEnvironment();
  for (const key of Object.keys(process.env)) if (!(key in filtered)) env[key] = null;
  const terminal = vscode.window.createTerminal({
    name: "Codex: Sign in with ChatGPT",
    shellPath: codexExecutable(),
    shellArgs: ["login"],
    env,
  });
  terminal.show();
  void vscode.window.showInformationMessage("Complete the ChatGPT sign-in, then click Refresh in Berry Patch.");
}

/** Starting Codex spawns a process, so only probe when Codex is the engine in use. */
export async function codexStatus(probe: boolean): Promise<EngineStatus> {
  const base: EngineStatus = {
    id: "codex",
    label: "Codex",
    ready: true,
    detail: "Runs your own Codex CLI, including a private or self-hosted build.",
    action: null,
    models: [],
    selectedModel: null,
  };
  if (!probe) return base;

  const error = await checkCodex(codexExecutable());
  return {
    ...base,
    ready: !error,
    detail: error ?? "Codex is signed in with ChatGPT. Reviews use your ChatGPT plan limits.",
    action: error ? { label: "Connect Codex", kind: "connectCodex" } : null,
  };
}
