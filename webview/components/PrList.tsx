import { useMemo, useState } from "react";
import type { PrReason, PullRequestSummary, ReviewResult } from "../../src/shared/protocol";
import type { ReviewJob } from "../App";
import { send, timeAgo } from "../vscode";
import { ArchiveIcon, Pill, RestoreIcon, Spinner, VerdictPill } from "./ui";

type Filter = "all" | PrReason | "archived";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review-requested", label: "Review requested" },
  { id: "assigned", label: "Assigned" },
  { id: "archived", label: "Archived" },
];

interface Props {
  prs: PullRequestSummary[];
  reviews: Record<string, ReviewResult>;
  jobs: Record<string, ReviewJob>;
  archived: Set<string>;
  loading: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function PrList({ prs, reviews, jobs, archived, loading, selectedKey, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const active = prs.filter((p) => !archived.has(p.key));
    return {
      all: active.length,
      "review-requested": active.filter((p) => p.reasons.includes("review-requested")).length,
      assigned: active.filter((p) => p.reasons.includes("assigned")).length,
      archived: prs.length - active.length,
    } satisfies Record<Filter, number>;
  }, [prs, archived]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prs.filter((p) => {
      const isArchived = archived.has(p.key);
      const matchesTab =
        filter === "archived" ? isArchived : !isArchived && (filter === "all" || p.reasons.includes(filter));
      return matchesTab && (!q || `${p.key} ${p.title} ${p.author}`.toLowerCase().includes(q));
    });
  }, [prs, archived, filter, query]);

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
        <div className="flex flex-wrap gap-1" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`cursor-pointer rounded-sm px-2 py-0.5 text-[11px] ${
                filter === f.id ? "bg-badge text-badge-fg" : "text-muted hover:bg-hover"
              }`}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((pr) => (
          <PrRow
            key={pr.key}
            pr={pr}
            review={reviews[pr.key]}
            job={jobs[pr.key]}
            archived={archived.has(pr.key)}
            selected={pr.key === selectedKey}
            onSelect={() => onSelect(pr.key)}
          />
        ))}
        {!visible.length && (
          <li className="p-6 text-center text-xs text-muted">{emptyMessage(filter, loading, counts)}</li>
        )}
      </ul>
    </>
  );
}

function emptyMessage(filter: Filter, loading: boolean, counts: Record<Filter, number>): string {
  if (loading) return "Picking pull requests…";
  if (filter === "archived") return "Nothing archived yet. Archive a PR to tuck it out of your list.";
  if (counts.all === 0 && counts.archived > 0) return "All caught up. Everything left is archived.";
  if (counts.all === 0) return "Nothing waiting on you. Go enjoy some berries. 🍓";
  return "No PRs match this filter.";
}

function PrRow({
  pr,
  review,
  job,
  archived,
  selected,
  onSelect,
}: {
  pr: PullRequestSummary;
  review?: ReviewResult;
  job?: ReviewJob;
  archived: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const running = job && !job.error;
  const stale = review && pr.updatedAt > review.reviewedAt;

  return (
    <li className="group/row relative">
      <button
        onClick={onSelect}
        className={`flex w-full cursor-pointer gap-2.5 border-b border-border px-3 py-2.5 text-left ${
          selected ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-hover"
        } ${archived ? "opacity-60" : ""}`}
      >
        {pr.authorAvatar ? (
          <img src={pr.authorAvatar} alt="" className="mt-0.5 size-6 shrink-0 rounded-full" />
        ) : (
          <span className="mt-0.5 size-6 shrink-0 rounded-full bg-badge" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate pr-6 text-[11px] text-muted">
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

      <button
        onClick={() => send({ type: archived ? "unarchive" : "archive", prKey: pr.key })}
        title={archived ? "Restore to your list" : "Archive this pull request"}
        aria-label={archived ? `Restore ${pr.key}` : `Archive ${pr.key}`}
        className="absolute top-2 right-2 cursor-pointer rounded-sm p-1 text-muted opacity-0 hover:bg-hover hover:text-fg focus-visible:opacity-100 group-hover/row:opacity-100"
      >
        {archived ? <RestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />}
      </button>
    </li>
  );
}
