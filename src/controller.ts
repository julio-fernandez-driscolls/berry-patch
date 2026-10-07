import { codexExecutable, codexStatus, signInCodex } from "./codexConnection";
import { codexRunner } from "./codex";
import { copilotRunner, copilotStatus } from "./copilot";
import * as vscode from "vscode";
import { GitHubClient, type ReviewComment } from "./github";
import { GuidelineStore } from "./guidelines";
import { ReviewPanel } from "./panel";
import { reviewPullRequest, type ReviewRunner } from "./reviewer";
import type {
  EngineId,
  EngineState,
  Finding,
  HostToWebview,
  PullRequestSummary,
  ReviewResult,
  WebviewToHost,
} from "./shared/protocol";
const REVIEWS_STATE = "prReviewer.reviews";
const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  critical: "🔴 Critical",
  major: "🟠 Major",
  minor: "🟡 Minor",
  nit: "⚪ Nit",
};

export class PrReviewController implements vscode.Disposable {
  private prs: PullRequestSummary[] = [];
  private fetchedAt = "";
  private user: string | null = null;
  private readonly inFlight = new Map<string, AbortController>();
  private readonly statusBar: vscode.StatusBarItem;
  private readonly guidelines: GuidelineStore;
  private readonly disposables: vscode.Disposable[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.guidelines = new GuidelineStore(context.globalState);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusBar.name = "Driscoll's Berry Patch";
    this.statusBar.command = "prReviewer.open";
    this.statusBar.tooltip = "Driscoll's Berry Patch: pull requests waiting on you";
    this.statusBar.text = "$(berry-patch-strawberry) PRs";
    this.statusBar.show();
    this.disposables.push(vscode.lm.onDidChangeChatModels(() => void this.pushState()));
    this.schedulePolling();
  }

  // ---------- Public commands ----------

  open(): void {
    ReviewPanel.show(this.context.extensionUri, (msg) => void this.onMessage(msg));
  }

  async refresh(interactive = true): Promise<void> {
    this.post({ type: "loading", loading: true });
    try {
      await this.pushState();
      const gh = await this.github(interactive);
      if (!gh) {
        this.post({ type: "error", message: "Sign in to GitHub to load your pull requests." });
        return;
      }
      const cfg = this.config();
      this.user ??= await gh.getViewerLogin();
      this.prs = await gh.listMyPullRequests({
        reviewRequested: cfg.get("includeReviewRequested", true),
        assigned: cfg.get("includeAssigned", true),
      });
      this.fetchedAt = new Date().toISOString();
      this.statusBar.text = `$(berry-patch-strawberry) ${this.prs.length} PR${this.prs.length === 1 ? "" : "s"}`;
      await this.pushState();
      this.post({ type: "prs", prs: this.prs, fetchedAt: this.fetchedAt });
    } catch (err) {
      this.post({ type: "error", message: errorMessage(err) });
    } finally {
      this.post({ type: "loading", loading: false });
    }
  }

  async connectCodex(): Promise<void> {
    await signInCodex();
    await this.pushState();
  }

  /** Command-palette equivalent of the engine switch in the panel. */
  async selectEngine(): Promise<void> {
    const { active, statuses } = await this.engineState();
    const picked = await vscode.window.showQuickPick(
      statuses.map((status) => ({
        label: status.id === active ? `$(check) ${status.label}` : status.label,
        description: status.id === active ? "Current" : "",
        detail: status.detail,
        id: status.id,
      })),
      { title: "Driscoll's Berry Patch: review engine", placeHolder: "Choose which engine reviews pull requests" },
    );
    if (picked && picked.id !== active) {
      await this.config().update("engine", picked.id, vscode.ConfigurationTarget.Global);
    }
  }

  onConfigChanged(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration("prReviewer.pollIntervalMinutes")) this.schedulePolling();
    if (
      e.affectsConfiguration("prReviewer.engine") ||
      e.affectsConfiguration("prReviewer.copilotModel") ||
      e.affectsConfiguration("prReviewer.codexModel") ||
      e.affectsConfiguration("prReviewer.codexPath")
    ) {
      void this.pushState();
    }
    if (
      e.affectsConfiguration("prReviewer.includeAssigned") ||
      e.affectsConfiguration("prReviewer.includeReviewRequested")
    ) {
      void this.refresh(false);
    }
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.inFlight.forEach((c) => c.abort());
    this.disposables.forEach((d) => d.dispose());
    this.statusBar.dispose();
  }

  // ---------- Webview messages ----------

  private async onMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case "ready":
        // Before engine state, which can take seconds to probe Codex.
        await this.pushGuidelines();
        await this.pushState();
        this.post({ type: "reviews", reviews: this.savedReviews() });
        if (this.prs.length) this.post({ type: "prs", prs: this.prs, fetchedAt: this.fetchedAt });
        else await this.refresh();
        return;
      case "refresh":
        return this.refresh();
      case "connectCodex":
        return this.connectCodex();
      case "refreshEngines":
        return this.pushState();
      case "setEngine":
        await this.config().update("engine", msg.engine, vscode.ConfigurationTarget.Global);
        return;
      case "setModel":
        await this.config().update(
          msg.engine === "codex" ? "codexModel" : "copilotModel",
          msg.model,
          vscode.ConfigurationTarget.Global,
        );
        return;
      case "review":
        return this.review(msg.prKey);
      case "cancelReview":
        this.inFlight.get(msg.prKey)?.abort();
        return;
      case "openExternal":
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        return;
      case "openFile":
        return this.openFile(msg.file, msg.line);
      case "chooseGuideline":
        await this.guidelines.choose(msg.repo);
        return this.pushGuidelines();
      case "openGuideline":
        await this.guidelines.open(msg.repo);
        return this.pushGuidelines();
      case "clearGuideline":
        await this.guidelines.clear(msg.repo);
        return this.pushGuidelines();
      case "postReview":
        return this.postReview(msg.prKey, msg.event, msg.body, msg.findingIds);
    }
  }

  private async review(prKey: string): Promise<void> {
    const pr = this.prs.find((p) => p.key === prKey);
    if (!pr || this.inFlight.has(prKey)) return;

    const abort = new AbortController();
    this.inFlight.set(prKey, abort);
    const progress = (stage: string) => this.post({ type: "reviewProgress", prKey, stage });

    try {
      const guidelines = await this.guidelines.read(`${pr.owner}/${pr.repo}`);
      const gh = await this.github(true);
      if (!gh) throw new Error("Not signed in to GitHub.");
      progress("Fetching pull request diff…");
      const [pull, files] = await Promise.all([
        gh.getPull(pr.owner, pr.repo, pr.number),
        gh.listFiles(pr.owner, pr.repo, pr.number),
      ]);

      const cfg = this.config();
      const engine = this.engine();
      const review = await reviewPullRequest(prKey, pull, files, {
        engine,
        run: this.runner(engine),
        extraInstructions: cfg.get("reviewInstructions", ""),
        guidelines,
        signal: abort.signal,
        onProgress: progress,
      });
      await this.saveReview(review);
      this.post({ type: "reviewDone", review });
    } catch (err) {
      const message = abort.signal.aborted ? "Review cancelled." : errorMessage(err);
      this.post({ type: "reviewFailed", prKey, message });
      // The guideline file may be why it failed; refresh its status in the panel.
      void this.pushGuidelines();
    } finally {
      this.inFlight.delete(prKey);
    }
  }

  private async postReview(
    prKey: string,
    event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE",
    body: string,
    findingIds: string[],
  ): Promise<void> {
    const pr = this.prs.find((p) => p.key === prKey);
    const review = this.savedReviews()[prKey];
    if (!pr || !review) return;

    const selected = review.findings.filter((f) => findingIds.includes(f.id));
    const inline = selected.filter((f) => f.commentable);
    const general = selected.filter((f) => !f.commentable);

    const eventLabel = { COMMENT: "comment", REQUEST_CHANGES: "request changes", APPROVE: "approve" }[event];
    const choice = await vscode.window.showWarningMessage(
      `Post a "${eventLabel}" review to ${prKey} on GitHub as ${this.user ?? "you"}?`,
      {
        modal: true,
        detail: `${inline.length} inline comment(s) and ${general.length} note(s) in the review body. This is visible to everyone on the PR.`,
      },
      "Post review",
    );
    if (choice !== "Post review") return;

    try {
      const gh = await this.github(true);
      if (!gh) throw new Error("Not signed in to GitHub.");

      // GitHub rejects the whole review if any inline comment targets a line outside the
      // current diff, so refuse to post against a head commit the review didn't see.
      const pull = await gh.getPull(pr.owner, pr.repo, pr.number);
      if (pull.head.sha !== review.headSha && inline.length) {
        throw new Error("New commits were pushed since this review ran. Re-run the review before posting inline comments.");
      }

      const comments: ReviewComment[] = inline.map((f) => ({
        path: f.file,
        line: f.line!,
        side: "RIGHT",
        body: formatFinding(f),
      }));
      const bodyParts = [body.trim()];
      if (general.length) {
        bodyParts.push(
          "### Additional notes\n\n" +
            general
              .map((f) => {
                const where = f.file ? `\`${f.file}${f.line ? `:${f.line}` : ""}\`\n\n` : "";
                return `${where}${formatFinding(f)}`;
              })
              .join("\n\n---\n\n"),
        );
      }
      bodyParts.push("<sub>🍓 Drafted with Driscoll's Berry Patch and reviewed before posting.</sub>");

      const res = await gh.createReview(pr.owner, pr.repo, pr.number, {
        commit_id: review.headSha,
        body: bodyParts.filter(Boolean).join("\n\n"),
        event,
        comments,
      });
      await this.saveReview({ ...review, postedUrl: res.html_url });
      this.post({ type: "reviewPosted", prKey, url: res.html_url });
      vscode.window.showInformationMessage(`Review posted to ${prKey}.`, "Open on GitHub").then((a) => {
        if (a) void vscode.env.openExternal(vscode.Uri.parse(res.html_url));
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to post review: ${errorMessage(err)}`);
    }
  }

  private async openFile(file: string, line: number | null): Promise<void> {
    const matches = await vscode.workspace.findFiles(file, "**/node_modules/**", 1);
    if (!matches.length) {
      vscode.window.showWarningMessage(`${file} is not in the open workspace.`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(matches[0]);
    const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0);
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos) });
  }

  // ---------- Helpers ----------

  private async github(interactive: boolean): Promise<GitHubClient | undefined> {
    const session = await vscode.authentication.getSession("github", ["repo"], {
      createIfNone: interactive,
      silent: !interactive,
    });
    return session ? new GitHubClient(session.accessToken) : undefined;
  }

  private async pushState(): Promise<void> {
    this.post({ type: "state", user: this.user, engines: await this.engineState() });
  }

  private async pushGuidelines(): Promise<void> {
    this.post({ type: "guidelines", guidelines: await this.guidelines.all() });
  }

  private engine(): EngineId {
    return this.config().get<EngineId>("engine", "copilot") === "codex" ? "codex" : "copilot";
  }

  private async engineState(): Promise<EngineState> {
    const cfg = this.config();
    const active = this.engine();
    const statuses = await Promise.all([
      copilotStatus(cfg.get("copilotModel", "")),
      codexStatus(active === "codex"),
    ]);
    return { active, statuses };
  }

  private runner(engine: EngineId): ReviewRunner {
    const cfg = this.config();
    if (engine === "codex") {
      return codexRunner({
        executable: codexExecutable(),
        model: cfg.get("codexModel", ""),
        effort: cfg.get("codexEffort", "high"),
      });
    }
    return copilotRunner(cfg.get("copilotModel", ""));
  }

  private savedReviews(): Record<string, ReviewResult> {
    return this.context.globalState.get<Record<string, ReviewResult>>(REVIEWS_STATE, {});
  }

  private async saveReview(review: ReviewResult): Promise<void> {
    const all = this.savedReviews();
    all[review.prKey] = review;
    // Keep the 100 most recent reviews so global state doesn't grow without bound.
    const trimmed = Object.fromEntries(
      Object.entries(all)
        .sort(([, a], [, b]) => b.reviewedAt.localeCompare(a.reviewedAt))
        .slice(0, 100),
    );
    await this.context.globalState.update(REVIEWS_STATE, trimmed);
  }

  private schedulePolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const minutes = this.config().get("pollIntervalMinutes", 10);
    if (minutes > 0) {
      this.pollTimer = setInterval(() => void this.refresh(false), minutes * 60_000);
    }
  }

  private config() {
    return vscode.workspace.getConfiguration("prReviewer");
  }

  private post(msg: HostToWebview): void {
    ReviewPanel.post(msg);
  }
}

function formatFinding(f: Finding): string {
  const parts = [`**${SEVERITY_LABEL[f.severity]} · ${f.category}: ${f.title}**`, f.explanation];
  if (f.suggestion) parts.push(`**Suggestion:**\n${f.suggestion}`);
  return parts.join("\n\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
