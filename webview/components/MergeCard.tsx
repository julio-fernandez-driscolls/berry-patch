import { useState } from "react";
import type { MergeInfo, MergeMethod, PullRequestSummary } from "../../src/shared/protocol";
import { send } from "../vscode";
import { Button, MergeIcon, Pill, Spinner } from "./ui";

const METHOD_LABEL: Record<MergeMethod, string> = {
  merge: "Merge commit",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
};

interface Props {
  pr: PullRequestSummary;
  /** Undefined while the check is in flight; null when it couldn't be determined. */
  info: MergeInfo | null | undefined;
  merging: boolean;
}

/** Only rendered for users with push access, so reviewers never see a button they can't use. */
export function MergeCard({ pr, info, merging }: Props) {
  const [method, setMethod] = useState<MergeMethod | null>(null);
  if (!info || !info.canMerge || info.merged) return null;

  const chosen = method && info.methods.includes(method) ? method : info.methods[0];
  if (!chosen) return null;

  return (
    <section className="mt-4 rounded-sm border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase text-muted">Merge</h3>
        {info.ready ? (
          <Pill className="bg-ok/20 text-ok">Ready to merge</Pill>
        ) : (
          <Pill className="bg-major/20 text-major">Not ready</Pill>
        )}
      </div>

      {info.ready ? (
        <p className="text-xs text-muted">
          Merging into <span className="font-mono text-[11px]">{pr.repo}</span>'s base branch, pinned to the commit you
          reviewed.
        </p>
      ) : (
        <p className="text-xs text-major">{info.reason}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {info.methods.length > 1 && (
          <label className="flex items-center gap-1 text-xs text-muted">
            Method
            <select
              value={chosen}
              onChange={(e) => setMethod(e.target.value as MergeMethod)}
              disabled={!info.ready || merging}
              className="cursor-pointer rounded-sm border border-input-border bg-input px-1.5 py-0.5 text-xs text-input-fg outline-none focus:border-focus disabled:cursor-default disabled:opacity-50"
            >
              {info.methods.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        {merging && <Spinner className="ml-auto" />}
        <Button
          className={`inline-flex items-center ${merging ? "" : "ml-auto"}`}
          disabled={!info.ready || merging}
          onClick={() => send({ type: "merge", prKey: pr.key, method: chosen })}
        >
          <MergeIcon className="mr-1.5 size-3.5" />
          {merging ? "Merging…" : METHOD_LABEL[chosen]}
        </Button>
      </div>
    </section>
  );
}
