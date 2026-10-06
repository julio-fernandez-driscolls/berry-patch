import { useMemo, useState } from "react";
import type {
  Finding,
  PullRequestSummary,
  ReviewEvent,
  ReviewResult,
  Severity,
} from "../../src/shared/protocol";
import type { ReviewJob } from "../App";
import { send, timeAgo } from "../vscode";
import { Button, Md, Pill, SeverityPill, Spinner, VerdictPill } from "./ui";

const SEVERITIES: Severity[] = ["critical", "major", "minor", "nit"];

interface Props {
  pr: PullRequestSummary;
  review?: ReviewResult;
  job?: ReviewJob;
  engineLabel: string;
  onBack: () => void;
}

export function PrDetail({ pr, review, job, engineLabel, onBack }: Props) {
  const running = Boolean(job && !job.error);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-border px-5 py-4">
        <Button variant="ghost" className="mb-2 md:hidden" onClick={onBack}>
          ← All pull requests
        </Button>
        <div className="text-[11px] text-muted">
          {pr.owner}/{pr.repo} #{pr.number} · opened by {pr.author} {timeAgo(pr.createdAt)}
        </div>
        <h2 className="mt-1 text-base font-semibold">{pr.title}</h2>
        {pr.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {pr.labels.map((l) => (
              <Pill key={l.name} className="border border-border">
                <span className="mr-1 size-2 rounded-full" style={{ background: `#${l.color}` }} />
                {l.name}
              </Pill>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="secondary" onClick={() => send({ type: "cancelReview", prKey: pr.key })}>
              Cancel review
            </Button>
          ) : (
            <Button onClick={() => send({ type: "review", prKey: pr.key })}>
              {review ? "Re-run review" : `Review with ${engineLabel}`}
            </Button>
          )}
          <Button variant="secondary" onClick={() => send({ type: "openExternal", url: pr.url })}>
            Open on GitHub
          </Button>
          {running && (
            <span className="flex items-center gap-2 text-xs text-muted">
              <Spinner /> {job?.stage ?? "Starting…"}
            </span>
          )}
        </div>
        {job?.error && <p className="mt-2 text-xs text-error">{job.error}</p>}
      </div>

      {review ? (
        // Re-mount when a new review arrives so selection resets to its defaults.
        <ReviewBody key={review.reviewedAt} pr={pr} review={review} />
      ) : (
        !running && (
          <p className="px-5 py-8 text-xs text-muted">
            No review yet. {engineLabel} will read the full diff and flag bugs, security issues and risky changes.
            Nothing is posted to GitHub until you choose findings and confirm.
          </p>
        )
      )}
    </div>
  );
}

function ReviewBody({ pr, review }: { pr: PullRequestSummary; review: ReviewResult }) {
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set(SEVERITIES));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(review.findings.filter((f) => f.severity !== "nit").map((f) => f.id)),
  );

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, major: 0, minor: 0, nit: 0 };
    review.findings.forEach((f) => c[f.severity]++);
    return c;
  }, [review.findings]);

  const visible = review.findings
    .filter((f) => severityFilter.has(f.severity))
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="space-y-5 px-5 py-4">
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-muted">Summary</h3>
          <VerdictPill verdict={review.verdict} />
          <span className="text-[11px] text-muted">
            {review.model} · {timeAgo(review.reviewedAt)} ·{" "}
            {(review.usage.inputTokens + review.usage.outputTokens).toLocaleString()} tokens
          </span>
        </div>
        <div className="text-[13px]">
          <Md>{review.summary}</Md>
        </div>
        {pr.updatedAt > review.reviewedAt && (
          <p className="mt-2 text-xs text-major">The PR was updated after this review. Consider re-running it.</p>
        )}
        {review.skippedFiles.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Not reviewed (binary or too large for GitHub to diff): {review.skippedFiles.join(", ")}
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-muted">
            Findings ({review.findings.length})
          </h3>
          <div className="flex flex-wrap gap-1">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                aria-pressed={severityFilter.has(s)}
                onClick={() => setSeverityFilter((f) => toggle(f, s))}
                className={`cursor-pointer rounded-sm border border-border px-1.5 py-px text-[11px] capitalize ${
                  severityFilter.has(s) ? "bg-selected" : "opacity-50"
                }`}
              >
                {s} {counts[s]}
              </button>
            ))}
          </div>
        </div>

        {review.findings.length === 0 && <p className="text-xs text-muted">No issues found.</p>}
        <ul className="space-y-2">
          {visible.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              checked={selected.has(f.id)}
              onToggle={() => setSelected((s) => toggle(s, f.id))}
            />
          ))}
        </ul>
      </section>

      <PostReview pr={pr} review={review} selectedIds={[...selected]} />
    </div>
  );
}

function FindingCard({
  finding: f,
  checked,
  onToggle,
}: {
  finding: Finding;
  checked: boolean;
  onToggle: () => void;
}) {
  const location = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "PR-level";
  return (
    <li className="rounded-sm border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Include "${f.title}" when posting`}
          className="mt-0.5 cursor-pointer accent-accent"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityPill severity={f.severity} />
            <Pill className="border border-border">{f.category}</Pill>
            {f.file ? (
              <button
                onClick={() => send({ type: "openFile", file: f.file, line: f.line })}
                className="cursor-pointer truncate font-mono text-[11px] text-link hover:underline"
                title="Open in editor"
              >
                {location}
              </button>
            ) : (
              <span className="text-[11px] text-muted">{location}</span>
            )}
            {!f.commentable && (
              <span className="text-[10px] text-muted" title="Posted in the review body instead of inline">
                (review body)
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] font-medium">{f.title}</p>
          <div className="mt-1 text-xs">
            <Md>{f.explanation}</Md>
          </div>
          {f.suggestion && (
            <details className="mt-2 text-xs" open>
              <summary className="cursor-pointer text-muted">Suggested fix</summary>
              <div className="mt-1">
                <Md>{f.suggestion}</Md>
              </div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

function PostReview({
  pr,
  review,
  selectedIds,
}: {
  pr: PullRequestSummary;
  review: ReviewResult;
  selectedIds: string[];
}) {
  const defaultEvent: ReviewEvent =
    review.verdict === "request_changes" ? "REQUEST_CHANGES" : review.verdict === "approve" ? "APPROVE" : "COMMENT";
  const [event, setEvent] = useState<ReviewEvent>(defaultEvent);
  const [body, setBody] = useState(review.summary);

  const options: { id: ReviewEvent; label: string }[] = [
    { id: "COMMENT", label: "Comment" },
    { id: "REQUEST_CHANGES", label: "Request changes" },
    { id: "APPROVE", label: "Approve" },
  ];

  return (
    <section className="rounded-sm border border-border p-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide uppercase text-muted">Post to GitHub</h3>
      {review.postedUrl && (
        <p className="mb-2 text-xs">
          Posted ·{" "}
          <Button variant="ghost" onClick={() => send({ type: "openExternal", url: review.postedUrl! })}>
            View review
          </Button>
        </p>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        aria-label="Review summary"
        className="w-full resize-y rounded-sm border border-input-border bg-input p-2 text-xs text-input-fg outline-none focus:border-focus"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <fieldset className="flex flex-wrap gap-3 text-xs">
          <legend className="sr-only">Review type</legend>
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                name={`event-${pr.key}`}
                checked={event === o.id}
                onChange={() => setEvent(o.id)}
                className="accent-accent"
              />
              {o.label}
            </label>
          ))}
        </fieldset>
        <Button
          className="ml-auto"
          onClick={() => send({ type: "postReview", prKey: pr.key, event, body, findingIds: selectedIds })}
        >
          Post review ({selectedIds.length} finding{selectedIds.length === 1 ? "" : "s"})
        </Button>
      </div>
    </section>
  );
}
