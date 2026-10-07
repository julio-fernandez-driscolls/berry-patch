import * as vscode from "vscode";
import type { RepoGuideline } from "./shared/protocol";

const STATE_KEY = "prReviewer.guidelines";
const MAX_BYTES = 64 * 1024;

/**
 * Guideline files chosen per repository, keyed by "owner/repo". A `null` entry records that the
 * user chose to review that repo without one. Paths are machine-specific, so this stays in global
 * state rather than synced settings.
 */
export class GuidelineStore {
  constructor(private readonly state: vscode.Memento) {}

  async all(): Promise<Record<string, RepoGuideline | null>> {
    const entries = await Promise.all(
      Object.entries(this.saved()).map(async ([repo, saved]): Promise<[string, RepoGuideline | null]> => {
        if (!saved) return [repo, null];
        const uri = vscode.Uri.parse(saved);
        const found = await vscode.workspace.fs.stat(uri).then(
          () => true,
          () => false,
        );
        return [repo, { name: fileName(uri), path: uri.fsPath, found }];
      }),
    );
    return Object.fromEntries(entries);
  }

  /** Asks for a file until the user picks one that can be used, or cancels. */
  async choose(repo: string): Promise<void> {
    let defaultUri = this.uri(repo) ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    while (true) {
      const picked = (
        await vscode.window.showOpenDialog({
          title: `Review guidelines for ${repo}`,
          openLabel: "Use as guidelines",
          defaultUri,
        })
      )?.[0];
      if (!picked) return;

      const problem = await readGuideline(picked).then(
        () => undefined,
        (err: Error) => err.message,
      );
      if (!problem) return this.save(repo, picked.toString());

      const retry = await vscode.window.showWarningMessage(problem, { modal: true }, "Choose another file");
      if (!retry) return;
      defaultUri = picked;
    }
  }

  /** The repo's guidelines for a review, or undefined when it has none. Throws when the file can't be used. */
  async read(repo: string): Promise<{ name: string; text: string } | undefined> {
    const uri = this.uri(repo);
    if (!uri) return undefined;
    try {
      return { name: fileName(uri), text: await readGuideline(uri) };
    } catch (err) {
      throw new Error(`Couldn't use the review guidelines for ${repo}. ${(err as Error).message}`);
    }
  }

  async open(repo: string): Promise<void> {
    const uri = this.uri(repo);
    if (!uri) return;
    try {
      await vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
    } catch {
      void vscode.window.showWarningMessage(`${fileName(uri)} can't be opened. It may have been moved or deleted.`);
    }
  }

  clear(repo: string): Thenable<void> {
    return this.save(repo, null);
  }

  private uri(repo: string): vscode.Uri | undefined {
    const saved = this.saved()[repo];
    return saved ? vscode.Uri.parse(saved) : undefined;
  }

  private saved(): Record<string, string | null> {
    return this.state.get<Record<string, string | null>>(STATE_KEY, {});
  }

  private save(repo: string, uri: string | null): Thenable<void> {
    return this.state.update(STATE_KEY, { ...this.saved(), [repo]: uri });
  }
}

/** Any file name or extension is accepted, as long as the contents are reasonably sized text. */
async function readGuideline(uri: vscode.Uri): Promise<string> {
  const name = fileName(uri);
  let size: number;
  try {
    ({ size } = await vscode.workspace.fs.stat(uri));
  } catch {
    throw new Error(`${name} can't be found. It may have been moved or deleted.`);
  }
  if (size > MAX_BYTES) {
    throw new Error(`${name} is ${Math.ceil(size / 1024)} KB. Guideline files must be ${MAX_BYTES / 1024} KB or smaller.`);
  }

  const bytes = await vscode.workspace.fs.readFile(uri);
  // NUL bytes mean a binary file (PDF, Word, images). UTF-16 text has them too, so honour its byte-order mark first.
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
  if (!utf16 && bytes.includes(0)) {
    throw new Error(`${name} isn't a plain-text file. Save the guidelines as .md, .txt or another text format.`);
  }
  const text = new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(bytes).trim();
  if (!text) throw new Error(`${name} is empty.`);
  return text;
}

function fileName(uri: vscode.Uri): string {
  return uri.path.slice(uri.path.lastIndexOf("/") + 1);
}
