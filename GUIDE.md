# Driscoll's Berry Patch — Team Guide

A VS Code extension that collects the GitHub pull requests waiting on you and drafts a review of each one with AI. You read the findings, pick the ones you agree with, and post the review to GitHub yourself.

> *Only the finest patches make it to main.*

---

## What it does

**Finds the PRs waiting on you.** It searches GitHub for pull requests where your review is requested or you're the assignee, across every repo you have access to. A strawberry badge in the status bar shows the count, and the list refreshes every 10 minutes.

**Drafts the review.** Pick a PR and the extension sends its full annotated diff to an AI engine, which returns a summary, a verdict, and a list of findings. Each finding has:

| Part | Meaning |
| --- | --- |
| Severity | Critical, Major, Minor, or Nit |
| Category | bug, security, performance, error-handling, concurrency, maintainability, testing, style, docs |
| Location | `file:line` — click it to jump to that line in your editor |
| Explanation | The concrete scenario where the code breaks |
| Suggestion | A proposed fix, often as a code snippet |

**Keeps you in control.** Nothing reaches GitHub until you say so. Every finding has a checkbox, you can edit the summary text, and you choose whether the review is a Comment, Request changes, or Approve. A confirmation dialog appears before anything is posted, and each review can only be posted once.

**Merges, if you're allowed to.** When you have push access and the PR is genuinely ready, you can merge it without leaving the editor. See [Merging](#merging).

**Tidies your queue.** Archive PRs you're done with to get them out of your list, and restore them later. See [Archiving](#archiving).

**Follows your repo's rules.** Each repository can have its own guideline file so reviews match that codebase's standards. See [Review guidelines](#review-guidelines) below.

---

## Installing

### Requirements

- **VS Code 1.90 or newer**
- **GitHub Copilot and Copilot Chat extensions**, with your account entitled to use them. This is the default review engine.
- **A GitHub account** with access to the repos you review. You'll be prompted to sign in the first time.

Codex is an optional alternative engine; see [Switching engines](#switching-engines).

### Steps

1. Get the `driscolls-berry-patch-<version>.vsix` file.
2. Install it, either through the UI or the terminal:

   **UI:** Extensions view (`Ctrl+Shift+X`) → the `...` menu at the top → **Install from VSIX...** → pick the file.

   **Terminal:**
   ```powershell
   code --install-extension driscolls-berry-patch-<version>.vsix
   ```
3. Reload VS Code.
4. Press `Ctrl+Shift+P` and run **Driscoll's Berry Patch: Open**, or click the 🍓 badge in the status bar.
5. Approve the GitHub sign-in prompt. The first review also asks permission to use Copilot — choose **Allow**.

### Updating

Sideloaded extensions don't auto-update. When a new `.vsix` is shared, install it the same way and it replaces the old version.

---

## Using it

### Reviewing a pull request

1. Open the panel. The left column lists your PRs; filter by **Review requested** / **Assigned**, or search by repo, title or author.
2. Select a PR, then click **Review with Copilot**.
3. Read the summary and verdict at the top. Findings are listed below, grouped by severity.
4. Findings arrive collapsed so a long review stays scannable. Click any finding's title to expand its explanation and suggested fix, or use **Expand all**.
5. Use the severity buttons (Critical / Major / Minor / Nit) to hide the noise you don't care about.
6. Uncheck anything you disagree with. Nits are unchecked by default.
7. In **Post to GitHub**, edit the summary, choose Comment / Request changes / Approve, and click **Post review**. Confirm the dialog.

Findings pointing at lines inside the diff become inline comments. Anything else is appended to the review body under "Additional notes".

A review can only be posted once. After posting, the form is replaced by a **Posted** badge and a link to the review on GitHub. To post again, re-run the review — which also clears the previous findings.

### Archiving

Use **Archive** to take a PR out of your working list without touching anything on GitHub. It's purely local and private to you.

- Hover any row in the list and click the archive icon in its top-right corner, or use the **Archive** button in the PR detail header.
- Archived PRs move to the **Archived** tab and stop counting toward the 🍓 badge in your status bar and the "open PRs" total.
- Open the **Archived** tab and click the restore icon, or **Restore** in the detail header, to bring one back.
- When a PR is merged or closed and leaves your GitHub queue, it's dropped from the archive automatically. If someone later requests your review on it again, it returns as a normal unarchived PR.

### Merging

The **Merge** card appears in the PR detail header only when GitHub says you have push access to the repository. Reviewers without merge rights never see it.

The card shows one of two states:

- **Ready to merge** — green badge, with a method dropdown offering only the methods that repo allows (merge commit, squash, rebase).
- **Not ready** — an amber badge and the specific reason: conflicts, a draft PR, branch protection with unmet reviews or checks, a branch behind its base, or GitHub still computing mergeability.

Clicking merge opens a confirmation dialog naming the target branch and the PR size. Two safeguards apply:

- Permissions and mergeability are re-checked against GitHub immediately before the merge, not taken from what the panel last displayed.
- The merge is pinned to the exact commit you reviewed. If someone pushes while you're deciding, GitHub rejects it rather than merging unreviewed code.

After a successful merge the PR disappears from your list.

### Review guidelines

Every repo can have its own guideline file describing its coding standards, required patterns, security rules, or what makes a PR acceptable. The AI reads it as review criteria: it names the broken rule in each finding and weighs it when choosing severities and the verdict.

**To set one up:** open any PR from that repo. A card appears above the Review button asking whether you want guidelines. Click **Choose file…** and pick your file.

- **Any file name or extension works** — `.md`, `.txt`, whatever you already have. It just has to be plain text and 64 KB or smaller.
- **You're asked once per repository.** `ggs-api` and `ggs-db` each keep their own file, and **Not now** dismisses the prompt without blocking reviews.
- **The file is re-read on every review**, so edits apply immediately to the next run.
- **Choices are stored on your machine only**, since file paths differ between computers. Each teammate picks their own copy.
- Finished reviews show a pill with the file name, so you can tell which rules were applied.

A guideline file is just prose. For example:

```markdown
# API review guidelines

- Every endpoint must validate its input with a zod schema before touching the database.
- Never log request bodies, tokens, or anything from the Authorization header.
- Database access goes through the repository layer, never raw SQL in a controller.
- Any new endpoint needs an integration test covering the unauthorized case.
- Breaking changes to a public response shape require a version bump.
```

### Switching engines

**Copilot** (default) uses the access your editor already has — no extra sign-in. If your organization offers several models, a **Model** dropdown appears in the engine bar.

**Codex** is an alternative that runs through a Codex CLI you provide. It needs either the ChatGPT extension (`openai.chatgpt`) installed, or a path set in `prReviewer.codexPath`. Switch with the toggle at the top of the panel, or run **Driscoll's Berry Patch: Select Review Engine**.

---

## Commands

Run these from the Command Palette (`Ctrl+Shift+P`):

| Command | Does |
| --- | --- |
| Driscoll's Berry Patch: Open | Opens the main panel |
| Driscoll's Berry Patch: Refresh Pull Requests | Re-fetches your PR list now |
| Driscoll's Berry Patch: Select Review Engine | Switches between Copilot and Codex |
| Driscoll's Berry Patch: Connect Codex | Signs in to Codex with ChatGPT |

## Settings

Search for `prReviewer` in Settings (`Ctrl+,`):

| Setting | Default | Does |
| --- | --- | --- |
| `engine` | `copilot` | Which engine reviews PRs |
| `copilotModel` | *(empty)* | Copilot model family, e.g. `gpt-4o`. Empty uses the first offered. |
| `pollIntervalMinutes` | `10` | How often to check GitHub. `0` disables background checks. |
| `includeReviewRequested` | `true` | Include PRs where your review is requested |
| `includeAssigned` | `true` | Include PRs assigned to you |
| `reviewInstructions` | *(empty)* | Guidance added to **every** review, across all repos |
| `codexModel` | *(empty)* | Codex model. Empty uses its default. |
| `codexEffort` | `high` | Reasoning effort Codex spends per review |
| `codexPath` | *(empty)* | Path to a Codex executable |

`reviewInstructions` applies everywhere; per-repo guideline files apply to one repo. Both can be used at once.

---

## Troubleshooting

**"GitHub Copilot isn't available in this window."**
Install the GitHub Copilot and Copilot Chat extensions and confirm your account has access, then click **Check again**.

**"VS Code needs your permission to use Copilot here."**
Start the review again and choose **Allow** at the prompt.

**The PR list is empty.**
Check that you're signed in to the right GitHub account (the panel header shows your username) and that `includeReviewRequested` / `includeAssigned` aren't both off. Click **Refresh**.

**"This PR's diff is too large to review in one pass."**
The diff exceeds 200,000 characters. Ask the author to split the PR.

**"New commits were pushed since this review ran."**
GitHub rejects inline comments on lines outside the current diff. Re-run the review against the new commits before posting.

**Clicking a `file:line` says it isn't in the workspace.**
The file has to be open in your VS Code workspace. Open the repo the PR belongs to.

**The Merge card isn't showing.**
It only appears when GitHub reports push access on that repository. If you believe you have it, click **Refresh** so permissions are re-fetched.

**"Failed to merge: Head branch was modified. Review and try the merge again."**
Someone pushed a commit after the page loaded. The merge is deliberately pinned to the commit you reviewed, so re-run the review on the new commits before merging.

---

## Privacy

- Your GitHub sign-in goes through VS Code's built-in account system. The extension never stores a token.
- PR diffs are sent to whichever engine you select — Copilot uses your organization's existing entitlement.
- Reviews are cached locally (the 100 most recent) so you don't re-run them. Guideline file paths are also stored locally.
- Archived PRs are a local preference. Nothing is sent to GitHub and teammates can't see what you've archived.
- The extension never posts or merges without your explicit confirmation.
