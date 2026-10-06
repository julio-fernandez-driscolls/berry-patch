/**
 * Prefix each line of a unified-diff patch with its line number in the new file, so the
 * model can cite exact lines, and collect the new-file lines GitHub accepts inline
 * review comments on (added and context lines, i.e. side RIGHT).
 */
export function annotatePatch(patch: string): { text: string; commentableLines: Set<number> } {
  const out: string[] = [];
  const commentableLines = new Set<number>();
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      out.push(raw);
      continue;
    }
    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === "+") {
      out.push(`${pad(newLine)} + ${content}`);
      commentableLines.add(newLine++);
    } else if (marker === " ") {
      out.push(`${pad(newLine)}   ${content}`);
      commentableLines.add(newLine++);
    } else if (marker === "-") {
      out.push(`${pad(null)} - ${content}`);
    } else {
      // "\ No newline at end of file" and anything unexpected pass through untouched.
      out.push(raw);
    }
  }
  return { text: out.join("\n"), commentableLines };
}

function pad(n: number | null): string {
  return (n === null ? "" : String(n)).padStart(6, " ");
}
