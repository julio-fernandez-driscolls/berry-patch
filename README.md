# Driscoll's Berry Patch

Pick the GitHub pull requests waiting on you and review them with Codex. Only the finest patches make it to main.

## Install

1. Grab the `driscolls-berry-patch-<version>.vsix` file.
2. In VS Code, open the Extensions view, click the `...` menu, and choose **Install from VSIX...**.
   Or from a terminal: `code --install-extension driscolls-berry-patch-<version>.vsix`
3. Reload VS Code.

## Getting started

- Run **Driscoll's Berry Patch: Open** from the Command Palette.
- Sign in to GitHub when prompted so the extension can find pull requests waiting on you.
- Reviews run on GitHub Copilot by default. To use Codex instead, run
  **Driscoll's Berry Patch: Select Review Engine** and pick Codex.

## Review guidelines

Each repository can have its own guideline file: coding standards, required patterns, security rules, or what makes a PR acceptable. Open any PR from that repo and choose **Choose file…** in the "Add review guidelines" card. Any plain-text file up to 64 KB works, whatever its name or extension.

The file is read fresh on every review, so edits apply to the next run. Guideline choices are stored per machine, so each teammate picks their own copy.

## Settings

All settings live under `prReviewer.*` in Settings. The ones worth knowing:

| Setting | What it does |
| --- | --- |
| `prReviewer.engine` | `copilot` or `codex` |
| `prReviewer.pollIntervalMinutes` | How often to check GitHub. `0` turns off background checks. |
| `prReviewer.reviewInstructions` | Team-specific guidance added to every review prompt. |
| `prReviewer.codexPath` | Path to your own Codex executable. |

## Building the VSIX

```sh
npm install
npm run package
```
