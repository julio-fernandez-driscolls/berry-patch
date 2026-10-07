import { useEffect, useMemo, useReducer, useState } from "react";
import type {
  EngineState,
  HostToWebview,
  PullRequestSummary,
  RepoGuideline,
  ReviewResult,
} from "../src/shared/protocol";
import { Button, Spinner } from "./components/ui";
import { BerryPatchWelcome, DriscollsWordmark } from "./components/Brand";
import { EngineBar } from "./components/EngineBar";
import { PrList } from "./components/PrList";
import { PrDetail } from "./components/PrDetail";
import { send, timeAgo } from "./vscode";

export interface ReviewJob {
  stage?: string;
  error?: string;
}

interface State {
  user: string | null;
  engines: EngineState | null;
  prs: PullRequestSummary[];
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  reviews: Record<string, ReviewResult>;
  jobs: Record<string, ReviewJob>;
  /** Null until the host reports it, so repos don't flash the "add guidelines" prompt on load. */
  guidelines: Record<string, RepoGuideline | null> | null;
}

const initial: State = {
  user: null,
  engines: null,
  prs: [],
  fetchedAt: null,
  loading: false,
  error: null,
  reviews: {},
  jobs: {},
  guidelines: null,
};

function reducer(state: State, msg: HostToWebview): State {
  switch (msg.type) {
    case "state":
      return { ...state, user: msg.user, engines: msg.engines };
    case "prs":
      return { ...state, prs: msg.prs, fetchedAt: msg.fetchedAt, error: null };
    case "loading":
      return { ...state, loading: msg.loading };
    case "error":
      return { ...state, error: msg.message };
    case "reviews":
      return { ...state, reviews: msg.reviews };
    case "reviewProgress":
      return { ...state, jobs: { ...state.jobs, [msg.prKey]: { stage: msg.stage } } };
    case "reviewDone": {
      const { [msg.review.prKey]: _, ...jobs } = state.jobs;
      return { ...state, jobs, reviews: { ...state.reviews, [msg.review.prKey]: msg.review } };
    }
    case "reviewFailed":
      return { ...state, jobs: { ...state.jobs, [msg.prKey]: { error: msg.message } } };
    case "reviewPosted": {
      const review = state.reviews[msg.prKey];
      if (!review) return state;
      return { ...state, reviews: { ...state.reviews, [msg.prKey]: { ...review, postedUrl: msg.url } } };
    }
    case "guidelines":
      return { ...state, guidelines: msg.guidelines };
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent<HostToWebview>) => dispatch(e.data);
    window.addEventListener("message", onMessage);
    send({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const selected = useMemo(
    () => state.prs.find((p) => p.key === selectedKey) ?? null,
    [state.prs, selectedKey],
  );

  const engineLabel =
    state.engines?.statuses.find((s) => s.id === state.engines?.active)?.label ?? "the review engine";

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <h1 className="flex items-center gap-2 text-wordmark">
          <DriscollsWordmark className="h-5 w-auto" />
          <span className="font-brand text-[17px] leading-none font-semibold">Berry Patch</span>
        </h1>
        <span className="text-xs text-muted">
          {state.user ? `@${state.user} · ` : ""}
          {state.prs.length} open PR{state.prs.length === 1 ? "" : "s"}
          {state.fetchedAt ? ` · updated ${timeAgo(state.fetchedAt)}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {state.loading && <Spinner />}
          <Button variant="secondary" onClick={() => send({ type: "refresh" })} disabled={state.loading}>
            Refresh
          </Button>
        </div>
      </header>
      <div className="berry-stripe" aria-hidden="true" />

      <EngineBar engines={state.engines} />
      {state.error && (
        <div className="border-b border-border px-4 py-2 text-xs text-error">{state.error}</div>
      )}

      <main className="flex min-h-0 flex-1">
        <aside
          className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col border-border md:w-[360px] md:shrink-0 md:border-r`}
        >
          <PrList
            prs={state.prs}
            reviews={state.reviews}
            jobs={state.jobs}
            loading={state.loading}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        </aside>
        <section className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {selected ? (
            <PrDetail
              pr={selected}
              review={state.reviews[selected.key]}
              job={state.jobs[selected.key]}
              guidelines={state.guidelines}
              engineLabel={engineLabel}
              onBack={() => setSelectedKey(null)}
            />
          ) : (
            <BerryPatchWelcome engineLabel={engineLabel} />
          )}
        </section>
      </main>
    </div>
  );
}
