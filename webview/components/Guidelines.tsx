import type { RepoGuideline } from "../../src/shared/protocol";
import { send } from "../vscode";
import { Button, DocIcon } from "./ui";

interface Props {
  /** "owner/repo". */
  repo: string;
  /** Short repo name used in the copy. */
  name: string;
  /** Undefined until the user decides for this repo; null once they chose to review without guidelines. */
  guideline: RepoGuideline | null | undefined;
}

/** Asks once per repo for an optional guideline file, then shows the chosen file as a compact chip. */
export function RepoGuidelines({ repo, name, guideline }: Props) {
  const choose = () => send({ type: "chooseGuideline", repo });
  const clear = () => send({ type: "clearGuideline", repo });

  if (guideline === undefined) {
    return (
      <section
        aria-label="Review guidelines"
        className="relative mt-3 overflow-hidden rounded-sm border border-border bg-card py-3 pr-3 pl-4"
      >
        <span aria-hidden="true" className="berry-stripe-v absolute inset-y-0 left-0" />
        <h3 className="font-brand text-[15px] leading-snug text-wordmark">Add review guidelines for {name}?</h3>
        <p className="mt-1 max-w-prose text-xs text-muted">
          Optional. Pick any text file with this repo's code standards, required patterns, security rules or PR
          expectations, and every {name} review will follow it.
        </p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <Button onClick={choose}>Choose file…</Button>
          <Button variant="ghost" onClick={clear}>
            Not now
          </Button>
        </div>
      </section>
    );
  }

  if (guideline === null) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <DocIcon className="size-3.5" />
        No review guidelines for {name}.
        <button onClick={choose} className="cursor-pointer text-link hover:underline">
          Add guidelines
        </button>
      </p>
    );
  }

  const { found } = guideline;
  return (
    <section
      aria-label="Review guidelines"
      className="mt-3 flex items-center gap-2.5 rounded-sm border border-border bg-card py-2 pr-1.5 pl-2"
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-sm ${
          found ? "bg-ok/15 text-ok" : "bg-critical/15 text-critical"
        }`}
      >
        <DocIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={guideline.path}>
          {guideline.name}
        </p>
        <p className={`truncate text-[11px] ${found ? "text-muted" : "text-error"}`}>
          {found ? `Review guidelines for every ${name} PR` : "File not found. It may have been moved or deleted."}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {found && (
          <Button variant="ghost" onClick={() => send({ type: "openGuideline", repo })}>
            Open
          </Button>
        )}
        <Button variant="ghost" onClick={choose}>
          {found ? "Change" : "Choose file…"}
        </Button>
        <Button variant="ghost" onClick={clear}>
          Remove
        </Button>
      </div>
    </section>
  );
}
