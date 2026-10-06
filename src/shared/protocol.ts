// Types shared by the extension host (src/) and the React webview (webview/).
// Keep this file free of Node or VS Code imports so both sides can bundle it.

export type PrReason = "review-requested" | "assigned";
export type Severity = "critical" | "major" | "minor" | "nit";
export type Verdict = "approve" | "comment" | "request_changes";
export type ReviewEvent = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";

/** Which backend runs the review. Copilot uses the access the editor already has. */
export type EngineId = "copilot" | "codex";

export interface EngineModel {
  /** Stable across sessions, so it is safe to persist as a setting. */
  id: string;
  label: string;
}

export interface EngineStatus {
  id: EngineId;
  label: string;
  ready: boolean;
  detail: string;
  action: { label: string; kind: "connectCodex" | "refresh" } | null;
  models: EngineModel[];
  selectedModel: string | null;
}

export interface EngineState {
  active: EngineId;
  statuses: EngineStatus[];
}

export interface PullRequestSummary {
  /** Stable key: "owner/repo#number". */
  key: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  authorAvatar: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  comments: number;
  reasons: PrReason[];
  labels: { name: string; color: string }[];
}

export interface Finding {
  id: string;
  file: string;
  /** Line in the new version of the file, or null for file- or PR-level notes. */
  line: number | null;
  severity: Severity;
  category: string;
  title: string;
  explanation: string;
  suggestion: string | null;
  /** True when `file:line` is inside the diff, so GitHub accepts it as an inline comment. */
  commentable: boolean;
}

export interface ReviewResult {
  prKey: string;
  headSha: string;
  reviewedAt: string;
  model: string;
  /** Absent on reviews saved before engines were selectable. */
  engine?: EngineId;
  summary: string;
  verdict: Verdict;
  findings: Finding[];
  /** Files GitHub returned without a patch (binary or too large), so the reviewer did not see them. */
  skippedFiles: string[];
  usage: { inputTokens: number; outputTokens: number };
  postedUrl?: string;
}

export type HostToWebview =
  | { type: "state"; user: string | null; engines: EngineState }
  | { type: "prs"; prs: PullRequestSummary[]; fetchedAt: string }
  | { type: "loading"; loading: boolean }
  | { type: "error"; message: string }
  | { type: "reviews"; reviews: Record<string, ReviewResult> }
  | { type: "reviewProgress"; prKey: string; stage: string }
  | { type: "reviewDone"; review: ReviewResult }
  | { type: "reviewFailed"; prKey: string; message: string }
  | { type: "reviewPosted"; prKey: string; url: string };

export type WebviewToHost =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "connectCodex" }
  | { type: "setEngine"; engine: EngineId }
  | { type: "setModel"; engine: EngineId; model: string }
  | { type: "refreshEngines" }
  | { type: "review"; prKey: string }
  | { type: "cancelReview"; prKey: string }
  | { type: "openExternal"; url: string }
  | { type: "openFile"; file: string; line: number | null }
  | {
      type: "postReview";
      prKey: string;
      event: ReviewEvent;
      body: string;
      findingIds: string[];
    };
