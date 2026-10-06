import type { PrReason, PullRequestSummary, ReviewEvent } from "./shared/protocol";

const API = "https://api.github.com";

interface SearchItem {
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: { login: string; avatar_url: string } | null;
  created_at: string;
  updated_at: string;
  draft?: boolean;
  comments: number;
  labels: { name: string; color: string }[];
}

export interface PullDetails {
  title: string;
  body: string | null;
  head: { sha: string; ref: string };
  base: { ref: string };
  user: { login: string } | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

export class GitHubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GitHubClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "pr-review-agent-vscode",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { message?: string; errors?: unknown[] };
        detail = body.message ?? detail;
        if (body.errors?.length) detail += `: ${JSON.stringify(body.errors)}`;
      } catch {
        // Non-JSON error body; keep the status text.
      }
      throw new GitHubError(res.status, `GitHub ${res.status}: ${detail}`);
    }
    return (await res.json()) as T;
  }

  async getViewerLogin(): Promise<string> {
    const me = await this.request<{ login: string }>("/user");
    return me.login;
  }

  private async search(query: string): Promise<SearchItem[]> {
    const q = encodeURIComponent(query);
    const res = await this.request<{ items: SearchItem[] }>(
      `/search/issues?q=${q}&sort=updated&order=desc&per_page=100`,
    );
    return res.items;
  }

  /** Open PRs where the viewer's review is requested and/or the viewer is an assignee, de-duplicated. */
  async listMyPullRequests(opts: {
    reviewRequested: boolean;
    assigned: boolean;
  }): Promise<PullRequestSummary[]> {
    const queries: [PrReason, string][] = [];
    if (opts.reviewRequested) {
      queries.push(["review-requested", "is:pr is:open archived:false review-requested:@me"]);
    }
    if (opts.assigned) {
      queries.push(["assigned", "is:pr is:open archived:false assignee:@me"]);
    }

    const results = await Promise.all(
      queries.map(async ([reason, q]) => ({ reason, items: await this.search(q) })),
    );

    const byKey = new Map<string, PullRequestSummary>();
    for (const { reason, items } of results) {
      for (const item of items) {
        const [owner, repo] = item.repository_url.split("/").slice(-2);
        const key = `${owner}/${repo}#${item.number}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.reasons.push(reason);
          continue;
        }
        byKey.set(key, {
          key,
          owner,
          repo,
          number: item.number,
          title: item.title,
          url: item.html_url,
          author: item.user?.login ?? "ghost",
          authorAvatar: item.user?.avatar_url ?? "",
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          draft: item.draft ?? false,
          comments: item.comments,
          reasons: [reason],
          labels: item.labels.map((l) => ({ name: l.name, color: l.color })),
        });
      }
    }
    return [...byKey.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getPull(owner: string, repo: string, number: number): Promise<PullDetails> {
    return this.request<PullDetails>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  /** All changed files with patches. GitHub caps this endpoint at 3000 files. */
  async listFiles(owner: string, repo: string, number: number): Promise<PullFile[]> {
    const files: PullFile[] = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await this.request<PullFile[]>(
        `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      );
      files.push(...batch);
      if (batch.length < 100) break;
    }
    return files;
  }

  createReview(
    owner: string,
    repo: string,
    number: number,
    review: { commit_id: string; body: string; event: ReviewEvent; comments: ReviewComment[] },
  ): Promise<{ html_url: string }> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
      method: "POST",
      body: JSON.stringify(review),
    });
  }
}
