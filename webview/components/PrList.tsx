import { useMemo, useState } from "react";
import type { PrReason, PullRequestSummary, ReviewResult } from "../../src/shared/protocol";
import type { ReviewJob } from "../App";
import { timeAgo } from "../vscode";
import { Pill, Spinner, VerdictPill } from "./ui";

type Filter = "all" | PrReason;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review-requested", label: "Review requested" },
  { id: "assigned", label: "Assigned" },
];

interface Props {
  prs: PullRequestSummary[];
  reviews: Record<string, ReviewResult>;
  jobs: Record<string, ReviewJob>;
  loading: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function PrList({ prs, reviews, jobs, loading, selectedKey, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prs.filter(
      (p) =>
        (filter === "all" || p.reasons.includes(filter)) &&
        (!q || `${p.key} ${p.title} ${p.author}`.toLowerCase().includes(q)),
    );
  }, [prs, filter, query]);

  return (
    <>
      <div className="space-y-2 border-b border-border p-3">
        <input
          type="search"
          placeholder="Filter by repo, title or author"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-sm border border-input-border bg-input px-2 py-1 text-xs text-input-fg outline-none focus:border-focus"
        />
        <div className="flex gap-1" role="tablist">
          {FILTERS.map((f) => {
            const count = f.id === "all" ? prs.length : prs.filter((p) => p.reasons.includes(f.id as PrReason)).length;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`cursor-pointer rounded-sm px-2 py-0.5 text-[11px] ${
                  filter === f.id ? "bg-badge text-badge-fg" : "text-muted hover:bg-hover"
                }`}
              >
                {f.label} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((pr) => (
          <PrRow
            key={pr.key}
            pr={pr}
            review={reviews[pr.key]}
            job={jobs[pr.key]}
            selected={pr.key === selectedKey}
            onSelect={() => onSelect(pr.key)}
          />
        ))}
        {!visible.length && (
          <li className="p-6 text-center text-xs text-muted">
            {loading ? "Picking pull requests…" : prs.length ? "No PRs match this filter." : "Nothing waiting on you. Go enjoy some berries. 🍓"}
          </li>
        )}
      </ul>
    </>
  );
}

function PrRow({
  pr,
  review,
  job,
  selected,
  onSelect,
}: {
  pr: PullRequestSummary;
  review?: ReviewResult;
  job?: ReviewJob;
  selected: boolean;
  onSelect: () => void;
}) {
  const running = job && !job.error;
  const stale = review && pr.updatedAt > review.reviewedAt;

  return (
    <li>
      <button
        onClick={onSelect}
        className={`flex w-full cursor-pointer gap-2.5 border-b border-border px-3 py-2.5 text-left ${
          selected ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-hover"
        }`}
      >
        {pr.authorAvatar ? (
          <img src={pr.authorAvatar} alt="" className="mt-0.5 size-6 shrink-0 rounded-full" />
        ) : (
          <span className="mt-0.5 size-6 shrink-0 rounded-full bg-badge" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] text-muted">
            {pr.owner}/{pr.repo} #{pr.number}
          </span>
          <span className="line-clamp-2 text-xs font-medium">{pr.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
            <span>
              {pr.author} · {timeAgo(pr.updatedAt)}
            </span>
            {pr.draft && <Pill className="bg-badge text-badge-fg">Draft</Pill>}
            {pr.reasons.includes("review-requested") && <Pill className="border border-border">Reviewer</Pill>}
            {pr.reasons.includes("assigned") && <Pill className="border border-border">Assignee</Pill>}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11px]">
            {running && (
              <>
                <Spinner />
                <span className="text-muted">Reviewing…</span>
              </>
            )}
            {!running && review && <VerdictPill verdict={review.verdict} />}
            {!running && review && (
              <span className="text-muted">
                {review.findings.length} finding{review.findings.length === 1 ? "" : "s"}
                {review.postedUrl ? " · posted" : ""}
                {stale ? " · PR updated since" : ""}
              </span>
            )}
            {job?.error && <span className="truncate text-error">Review failed</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
