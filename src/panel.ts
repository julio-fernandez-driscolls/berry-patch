import * as vscode from "vscode";
import type { HostToWebview, WebviewToHost } from "./shared/protocol";

/** Singleton editor-area panel hosting the React app from dist/webview. */
export class ReviewPanel {
  private static current: ReviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    extensionUri: vscode.Uri,
    onMessage: (msg: WebviewToHost) => void,
  ): ReviewPanel {
    if (ReviewPanel.current) {
      ReviewPanel.current.panel.reveal();
      return ReviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "prReviewer",
      "Berry Patch",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
          vscode.Uri.joinPath(extensionUri, "media"),
        ],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, "media", "strawberry.svg");
    ReviewPanel.current = new ReviewPanel(panel, extensionUri, onMessage);
    return ReviewPanel.current;
  }

  static post(msg: HostToWebview): void {
    void ReviewPanel.current?.panel.webview.postMessage(msg);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    onMessage: (msg: WebviewToHost) => void,
  ) {
    panel.webview.html = this.html(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage(onMessage, null, this.disposables);
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const asset = (name: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", name));
    const media = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media"));
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${asset("webview.css")}" />
  <title>Driscoll's Berry Patch</title>
</head>
<body data-media="${media}">
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${asset("webview.js")}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    ReviewPanel.current = undefined;
    this.disposables.forEach((d) => d.dispose());
  }
}
