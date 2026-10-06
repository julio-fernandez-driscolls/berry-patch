import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewRunner } from "./reviewer";

/** Keep the shared login, but never inherit API billing or provider overrides. */
export function subscriptionEnvironment(source = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([key]) =>
    key.toUpperCase() === "CODEX_HOME" || !/^(CODEX_|OPENAI_|ANTHROPIC_|AZURE_OPENAI_)/i.test(key),
  ));
}

export function runProcess(
  executable: string,
  args: string[],
  options: { cwd?: string; input?: string; signal?: AbortSignal; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error("Review cancelled."));
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: subscriptionEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; child.kill(); };
    const abort = () => stop(new Error("Review cancelled."));
    const timer = setTimeout(() => stop(new Error("Codex timed out. Try a smaller PR.")), options.timeout ?? 20 * 60_000);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 8_000_000) stop(new Error("Codex returned too much output."));
    });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-16_000); });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") stop(error);
    });
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code) => {
      cleanup();
      if (failure) reject(failure);
      else resolve({ stdout, stderr, code });
    });
    child.stdin.end(options.input ?? "");
  });
}

export function isChatGPTLogin(result: { code: number | null; stdout: string; stderr: string }): boolean {
  return result.code === 0 && /(?:^|\r?\n)Logged in using ChatGPT\s*(?:\r?\n|$)/i.test(result.stdout + "\n" + result.stderr);
}

export async function checkCodex(executable: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const result = await runProcess(executable, ["login", "status"], { timeout: 15_000, signal });
    if (isChatGPTLogin(result)) return null;
    return "Sign in to Codex with ChatGPT. API-key logins are not supported by this extension.";
  } catch (error) {
    if (signal?.aborted) throw error;
    return "Codex could not be started. Install the Codex VS Code extension, or set the Berry Patch \"Codex Path\" setting (prReviewer.codexPath) to a native Codex executable.";
  }
}

export function reviewArguments(schemaPath: string, outputPath: string, model: string, effort: string): string[] {
  return [
    "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
    "--sandbox", "read-only", "--json", "--color", "never",
    "-c", 'forced_login_method="chatgpt"', "-c", 'model_provider="openai"',
    "-c", 'approval_policy="never"', "-c", 'web_search="disabled"',
    ...["shell_tool", "unified_exec", "apps", "plugins", "hooks", "multi_agent", "browser_use", "computer_use", "image_generation"]
      .flatMap((feature) => ["-c", `features.${feature}=false`]),
    "-c", `model_reasoning_effort=${JSON.stringify(effort)}`,
    ...(model ? ["--model", model] : []),
    "--output-schema", schemaPath, "--output-last-message", outputPath, "-",
  ];
}

export function parseEvents(stdout: string): { inputTokens: number; outputTokens: number } {
  let completed = false;
  let usage = { inputTokens: 0, outputTokens: 0 };
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === "turn.failed" || event.type === "error") {
      throw new Error(event.error?.message ?? event.message ?? "Codex review failed.");
    }
    if (event.type === "turn.completed") {
      completed = true;
      usage = { inputTokens: event.usage?.input_tokens ?? 0, outputTokens: event.usage?.output_tokens ?? 0 };
    }
  }
  if (!completed) throw new Error("Codex stopped before completing the review.");
  return usage;
}

export async function runCodexReview(options: {
  executable: string; prompt: string; schema: unknown; model: string; effort: string; signal?: AbortSignal;
}) {
  const authError = await checkCodex(options.executable, options.signal);
  if (authError) throw new Error(authError);
  const directory = await mkdtemp(join(tmpdir(), "pr-review-agent-"));
  try {
    const schemaPath = join(directory, "schema.json");
    const outputPath = join(directory, "review.json");
    await writeFile(schemaPath, JSON.stringify(options.schema));
    const result = await runProcess(options.executable,
      reviewArguments(schemaPath, outputPath, options.model, options.effort),
      { cwd: directory, input: options.prompt, signal: options.signal });
    if (result.code !== 0 && !result.stdout.trim()) {
      throw new Error(`Codex could not run the review. Update Codex and check your ChatGPT sign-in. ${result.stderr.slice(-2000)}`);
    }
    // Parse failure events even when Codex also exits with an error code.
    const usage = parseEvents(result.stdout);
    if (result.code !== 0) throw new Error("Codex exited unsuccessfully. Check your subscription limits and Codex sign-in.");
    return { text: await readFile(outputPath, "utf8"), usage };
  } finally {
    // Only remove the unique temporary directory created by this invocation.
    await rm(directory, { recursive: true, force: true });
  }
}

/** Codex applies the schema natively via --output-schema. */
export function codexRunner(options: { executable: string; model: string; effort: string }): ReviewRunner {
  return async ({ system, user, schema, signal, onProgress }) => {
    onProgress?.("Codex is reviewing the diff with your ChatGPT sign-in…");
    const result = await runCodexReview({
      executable: options.executable,
      prompt: `${system}\n\nReturn JSON matching the supplied schema.\n\n${user}`,
      schema,
      model: options.model,
      effort: options.effort,
      signal,
    });
    return { ...result, model: options.model || "Codex (default model)" };
  };
}
