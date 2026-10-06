import * as vscode from "vscode";
import type { EngineModel, EngineStatus } from "./shared/protocol";
import type { ReviewRunner } from "./reviewer";

const JUSTIFICATION = "Driscoll's Berry Patch reviews the pull request you selected.";

const UNAVAILABLE =
  "GitHub Copilot isn't available in this window. Install the GitHub Copilot extension and make sure your account has access, then check again.";

/** Copilot models offered to the editor. Empty when Copilot is missing or not entitled. */
async function copilotModels(): Promise<vscode.LanguageModelChat[]> {
  try {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    // Families are stable across sessions; ids are not, so keep one model per family.
    const byFamily = new Map<string, vscode.LanguageModelChat>();
    for (const model of models) if (!byFamily.has(model.family)) byFamily.set(model.family, model);
    return [...byFamily.values()];
  } catch {
    return [];
  }
}

function choices(models: readonly vscode.LanguageModelChat[]): EngineModel[] {
  return models.map((model) => ({ id: model.family, label: model.name }));
}

function pick(models: vscode.LanguageModelChat[], family: string): vscode.LanguageModelChat {
  return models.find((model) => model.family === family) ?? models[0];
}

export async function copilotStatus(preferredFamily: string): Promise<EngineStatus> {
  const models = await copilotModels();
  const ready = models.length > 0;
  return {
    id: "copilot",
    label: "Copilot",
    ready,
    detail: ready
      ? "Uses the GitHub Copilot access your organization already gives you — no extra sign-in."
      : UNAVAILABLE,
    action: ready ? null : { label: "Check again", kind: "refresh" },
    models: choices(models),
    selectedModel: ready ? pick(models, preferredFamily).family : null,
  };
}

/**
 * Copilot has no structured-output mode, so the schema is sent as part of the prompt
 * and the reply is parsed defensively by the caller.
 */
export function copilotRunner(preferredFamily: string): ReviewRunner {
  return async ({ system, user, schema, signal, onProgress }) => {
    const models = await copilotModels();
    if (!models.length) throw new Error(UNAVAILABLE);

    const model = pick(models, preferredFamily);
    if (preferredFamily && model.family !== preferredFamily) {
      onProgress?.(`${preferredFamily} is unavailable; using ${model.name}.`);
    }

    const messages = [
      vscode.LanguageModelChatMessage.User(system),
      vscode.LanguageModelChatMessage.User(
        `${user}\n\nReply with ONLY a JSON object matching this JSON Schema. No Markdown fences, no commentary.\n${JSON.stringify(schema)}`,
      ),
    ];

    const cancellation = new vscode.CancellationTokenSource();
    const abort = () => cancellation.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    try {
      const counts = await Promise.all(messages.map((m) => model.countTokens(m, cancellation.token)));
      const inputTokens = counts.reduce((total, count) => total + count, 0);
      if (inputTokens > model.maxInputTokens) {
        throw new Error(
          `This PR needs ${inputTokens.toLocaleString()} tokens but ${model.name} accepts ${model.maxInputTokens.toLocaleString()}. ` +
            "Ask for a smaller PR, or choose a model with a larger context window.",
        );
      }

      onProgress?.(`${model.name} is reviewing the diff with your Copilot access…`);
      const response = await model.sendRequest(messages, { justification: JUSTIFICATION }, cancellation.token);
      let text = "";
      for await (const chunk of response.text) text += chunk;
      if (signal?.aborted) throw new Error("Review cancelled.");

      const outputTokens = await model.countTokens(text).then(
        (count) => count,
        () => 0,
      );
      return { text, usage: { inputTokens, outputTokens }, model: model.name };
    } catch (error) {
      throw describe(error, signal);
    } finally {
      signal?.removeEventListener("abort", abort);
      cancellation.dispose();
    }
  };
}

function describe(error: unknown, signal?: AbortSignal): Error {
  if (signal?.aborted || error instanceof vscode.CancellationError) return new Error("Review cancelled.");
  if (error instanceof vscode.LanguageModelError) {
    if (error.code === "NoPermissions") {
      return new Error("VS Code needs your permission to use Copilot here. Start the review again and choose Allow.");
    }
    if (error.code === "Blocked") {
      return new Error(
        "Copilot refused this request. You may have reached your organization's usage limit, or the diff triggered a content filter.",
      );
    }
    if (error.code === "NotFound") {
      return new Error("That Copilot model is no longer available. Pick a different model and try again.");
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}
