import type { PullDetails, RepoDetails } from "./github";
import type { MergeInfo, MergeMethod } from "./shared/protocol";

export function mergeInfo(pull: PullDetails, repo: RepoDetails): MergeInfo {
  const methods: MergeMethod[] = [];
  // GitHub omits these flags for some repositories; treat an absent flag as allowed.
  if (repo.allow_merge_commit !== false) methods.push("merge");
  if (repo.allow_squash_merge !== false) methods.push("squash");
  if (repo.allow_rebase_merge !== false) methods.push("rebase");

  const blocker = mergeBlocker(pull) ?? (methods.length ? null : "This repository allows no merge methods.");
  return {
    canMerge: repo.permissions?.push === true,
    ready: blocker === null,
    reason: blocker,
    methods,
    merged: pull.merged === true,
    headSha: pull.head.sha,
  };
}

/** Turns GitHub's `mergeable_state` into something a reviewer can act on. */
export function mergeBlocker(pull: PullDetails): string | null {
  if (pull.merged) return "This pull request is already merged.";
  if (pull.draft) return "This pull request is still a draft.";
  if (pull.mergeable === null || pull.mergeable === undefined || pull.mergeable_state === "unknown") {
    return "GitHub is still checking whether this can merge. Try again in a moment.";
  }
  if (pull.mergeable === false || pull.mergeable_state === "dirty") {
    return "This branch has conflicts that have to be resolved first.";
  }
  switch (pull.mergeable_state) {
    case "blocked":
      return "Branch protection is blocking this merge. Required reviews or status checks haven't passed.";
    case "behind":
      return "This branch is behind its base and has to be updated before it can merge.";
    default:
      return null;
  }
}
